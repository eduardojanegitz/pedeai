import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-middleware";
import { mapOrderError, RATE_LIMITED_MESSAGE, type OrderErrorCode } from "@/lib/order-errors";

// Todas as gravações e leituras de dados privados (participantes/pedidos) passam
// por aqui, com o client administrativo apenas no servidor.
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function hashToken(token: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type RoundState = "waiting" | "open" | "closed";
export type Round = {
  id: string;
  name: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opens_at: string | null;
  closes_at: string | null;
  /** Estado efetivo calculado no servidor: aguardando abertura, aberta ou encerrada (manual ou por horário). */
  state: RoundState;
};
/** Rodada atual + horário do servidor (para o cliente exibir contagem regressiva sem confiar no relógio local). */
export type ActiveRound = Round & { server_now: string };

const tokenSchema = z.string().min(32).max(128);

// Mesma regra de public.round_state(), com o relógio do servidor (usada só para listagens do admin).
function roundState(r: { status: string; opens_at: string | null; closes_at: string | null }, now = Date.now()): RoundState {
  if (r.status !== "open") return "closed";
  if (r.opens_at && now < Date.parse(r.opens_at)) return "waiting";
  if (r.closes_at && now >= Date.parse(r.closes_at)) return "closed";
  return "open";
}

// ---------- Rodadas ----------

/** Rodada atual (status 'open') com o estado calculado pelo relógio do banco. `null` = nenhuma rodada. */
export const getActiveRound = createServerFn({ method: "GET" }).handler(async (): Promise<ActiveRound | null> => {
  const db = await admin();
  const { data, error } = await db.rpc("get_active_round");
  if (error) {
    console.error(error);
    throw new Error("Não foi possível carregar a rodada.");
  }
  const r = data?.[0];
  return r ? ({ ...r, status: r.status as Round["status"], state: r.state as RoundState } satisfies ActiveRound) : null;
});

export const listRounds = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<Round[]> => {
    const db = await admin();
    const { data, error } = await db.from("rounds").select("*").order("opened_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar as rodadas.");
    const now = Date.now();
    return data.map((r) => ({ ...r, status: r.status as Round["status"], state: roundState(r, now) }));
  });

export const openRound = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => z.object({ name: z.string().trim().min(1, "Informe um nome").max(80) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    // Rodada que já encerrou por horário continua com status 'open' no banco: fecha de vez para liberar a próxima.
    await db
      .from("rounds")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("status", "open")
      .lte("closes_at", new Date().toISOString());
    const { error } = await db.from("rounds").insert({ name: data.name });
    if (error) {
      if (error.code === "23505") throw new Error("Já existe uma rodada aberta. Encerre-a antes de abrir outra.");
      throw new Error("Não foi possível abrir a rodada.");
    }
    return { ok: true };
  });

export const closeRound = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("rounds")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "open");
    if (error) throw new Error("Não foi possível encerrar a rodada.");
    return { ok: true };
  });

// ---------- Participante ----------

export type MyOrder = {
  participant: { id: string; display_name: string };
  /** O participante já tem celular cadastrado? (participantes antigos não têm) */
  has_phone: boolean;
  status: "confirmed" | "cancelled" | null;
  /** Versão do pedido (0 = ainda não existe). Enviada de volta ao salvar para detectar edição concorrente. */
  version: number;
  items: { product_id: string; quantity: number }[];
};

/** @deprecated Legado (só nome, sem celular). Será removido quando a nova identificação entrar na tela (bloco 4). */
export const registerParticipant = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ name: z.string().trim().min(1, "Informe seu nome").max(60), token: tokenSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const sec = await import("@/lib/participant-security.server");
    if (!(await sec.withinRateLimit(db, "register", 10, 600))) throw new Error(RATE_LIMITED_MESSAGE);
    const { error } = await db
      .from("participants")
      .insert({ display_name: data.name, token_hash: await hashToken(data.token) });
    if (error) throw new Error("Não foi possível salvar seu nome.");
    return { ok: true };
  });

async function findParticipant(db: Awaited<ReturnType<typeof admin>>, token: string) {
  const { data } = await db
    .from("participants")
    .select("id, display_name, phone_e164")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  return data;
}

/** Devolve o participante e o pedido dele na rodada; `participant: null` se o código não for reconhecido. */
export const getMyOrder = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: tokenSchema, roundId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data }): Promise<MyOrder | null> => {
    const db = await admin();
    const found = await findParticipant(db, data.token);
    if (!found) return null;
    // O celular nunca volta para o navegador: só se existe ou não.
    const participant = { id: found.id, display_name: found.display_name };
    const has_phone = found.phone_e164 !== null;
    if (!data.roundId) return { participant, has_phone, status: null, version: 0, items: [] };
    const { data: order } = await db
      .from("orders")
      .select("id, status, version, order_items(product_id, quantity)")
      .eq("round_id", data.roundId)
      .eq("participant_id", participant.id)
      .maybeSingle();
    if (!order) return { participant, has_phone, status: null, version: 0, items: [] };
    return {
      participant,
      has_phone,
      status: order.status as "confirmed" | "cancelled",
      version: order.version,
      items: order.order_items,
    };
  });

export const renameParticipant = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ name: z.string().trim().min(1, "Informe seu nome").max(60), token: tokenSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("participants")
      .update({ display_name: data.name })
      .eq("token_hash", await hashToken(data.token));
    if (error) throw new Error("Não foi possível alterar o nome.");
    return { ok: true };
  });

async function requireOpenRound(db: Awaited<ReturnType<typeof admin>>, roundId: string) {
  const { data } = await db.rpc("get_round_state", { p_round: roundId });
  if (data === "waiting") throw new Error("O cardápio ainda não abriu para pedidos.");
  if (data !== "open") throw new Error("Os pedidos já foram encerrados.");
}

export type SubmitResult =
  | { ok: true; version: number; orderId: string; replayed: boolean }
  | { ok: false; code: OrderErrorCode; message: string };

/**
 * Cria ou atualiza o pedido (confirmação e edição) em UMA transação no banco (`submit_order`):
 * horário, produtos, limites por categoria e versão são validados lá. Falhas esperadas voltam como
 * `ok: false` com código estável; o sucesso só é devolvido depois de gravado.
 * `requestId` torna o reenvio seguro (mesma chave = mesmo resultado, sem duplicar).
 */
export const submitOrder = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        roundId: z.string().uuid(),
        expectedVersion: z.number().int().min(0),
        requestId: z.string().uuid(),
        items: z
          .array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(99) }))
          .min(1, "Escolha ao menos um item")
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<SubmitResult> => {
    const db = await admin();
    const sec = await import("@/lib/participant-security.server");
    if (!(await sec.withinRateLimit(db, "submit", 30, 300))) {
      return { ok: false, code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE };
    }
    const participant = await findParticipant(db, data.token);
    if (!participant) return { ok: false, ...mapOrderError("PARTICIPANT_NOT_FOUND") };

    const { data: res, error } = await db.rpc("submit_order", {
      p_participant: participant.id,
      p_round: data.roundId,
      p_items: data.items,
      p_expected_version: data.expectedVersion,
      p_request_id: data.requestId,
    });
    if (error) {
      const mapped = mapOrderError(error.message, error.details);
      if (mapped.code === "UNKNOWN") console.error(error);
      return { ok: false, ...mapped };
    }
    const r = res as { order_id: string; version: number; replayed: boolean };
    return { ok: true, version: r.version, orderId: r.order_id, replayed: r.replayed };
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: tokenSchema, roundId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const participant = await findParticipant(db, data.token);
    if (!participant) throw new Error("Participante não reconhecido. Recarregue a página.");
    await requireOpenRound(db, data.roundId);
    const { error } = await db
      .from("orders")
      .update({ status: "cancelled" })
      .eq("round_id", data.roundId)
      .eq("participant_id", participant.id);
    if (error) throw new Error("Não foi possível cancelar o pedido.");
    return { ok: true };
  });

// ---------- Admin: pedidos ----------

export type RoundOrder = {
  order_id: string;
  participant: string;
  created_at: string;
  updated_at: string;
  items: { product_id: string; product: string; category: string | null; quantity: number }[];
};

export const getRoundOrders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((d: unknown) => z.object({ roundId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows, error } = await db
      .from("orders")
      .select(
        "id, created_at, updated_at, participants(display_name), order_items(quantity, product_id, products(name, categories(name)))",
      )
      .eq("round_id", data.roundId)
      .eq("status", "confirmed")
      .order("created_at");
    if (error) throw new Error("Não foi possível carregar os pedidos.");
    type Row = {
      id: string;
      created_at: string;
      updated_at: string;
      participants: { display_name: string } | null;
      order_items: {
        quantity: number;
        product_id: string;
        products: { name: string; categories: { name: string } | null } | null;
      }[];
    };
    const orders: RoundOrder[] = (rows as unknown as Row[]).map((o) => ({
      order_id: o.id,
      participant: o.participants?.display_name ?? "—",
      created_at: o.created_at,
      updated_at: o.updated_at,
      items: o.order_items.map((i) => ({
        product_id: i.product_id,
        product: i.products?.name ?? "Item removido",
        category: i.products?.categories?.name ?? null,
        quantity: i.quantity,
      })),
    }));
    return orders;
  });
