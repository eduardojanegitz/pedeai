import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-middleware";

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

export type Round = { id: string; name: string; status: "open" | "closed"; opened_at: string; closed_at: string | null };

const tokenSchema = z.string().min(32).max(128);

// ---------- Rodadas ----------

export const getActiveRound = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db.from("rounds").select("*").eq("status", "open").maybeSingle();
  if (error) throw new Error("Não foi possível carregar a rodada.");
  return (data as Round | null) ?? null;
});

export const listRounds = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const db = await admin();
  const { data, error } = await db.from("rounds").select("*").order("opened_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar as rodadas.");
  return data as Round[];
});

export const openRound = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => z.object({ name: z.string().trim().min(1, "Informe um nome").max(80) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
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
  status: "confirmed" | "cancelled" | null;
  items: { product_id: string; quantity: number }[];
};

export const registerParticipant = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ name: z.string().trim().min(1, "Informe seu nome").max(60), token: tokenSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("participants")
      .insert({ display_name: data.name, token_hash: await hashToken(data.token) });
    if (error) throw new Error("Não foi possível salvar seu nome.");
    return { ok: true };
  });

async function findParticipant(db: Awaited<ReturnType<typeof admin>>, token: string) {
  const { data } = await db
    .from("participants")
    .select("id, display_name")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  return data;
}

/** Devolve o participante e o pedido dele na rodada; `participant: null` se o código não for reconhecido. */
export const getMyOrder = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: tokenSchema, roundId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data }): Promise<MyOrder | null> => {
    const db = await admin();
    const participant = await findParticipant(db, data.token);
    if (!participant) return null;
    if (!data.roundId) return { participant, status: null, items: [] };
    const { data: order } = await db
      .from("orders")
      .select("id, status, order_items(product_id, quantity)")
      .eq("round_id", data.roundId)
      .eq("participant_id", participant.id)
      .maybeSingle();
    if (!order) return { participant, status: null, items: [] };
    return { participant, status: order.status as "confirmed" | "cancelled", items: order.order_items };
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
  const { data } = await db.from("rounds").select("status").eq("id", roundId).maybeSingle();
  if (!data || data.status !== "open") throw new Error("Esta rodada já foi encerrada.");
}

/** Cria ou substitui o pedido do participante (confirmação e edição). */
export const submitOrder = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        roundId: z.string().uuid(),
        items: z
          .array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(99) }))
          .min(1, "Escolha ao menos um item")
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const participant = await findParticipant(db, data.token);
    if (!participant) throw new Error("Participante não reconhecido. Recarregue a página.");
    await requireOpenRound(db, data.roundId);

    const ids = [...new Set(data.items.map((i) => i.product_id))];
    const { data: found } = await db.from("products").select("id").in("id", ids);
    if ((found?.length ?? 0) !== ids.length) throw new Error("Algum item não existe mais no cardápio.");

    const { data: order, error } = await db
      .from("orders")
      .upsert(
        { round_id: data.roundId, participant_id: participant.id, status: "confirmed" },
        { onConflict: "round_id,participant_id" },
      )
      .select("id")
      .single();
    if (error || !order) throw new Error("Não foi possível confirmar o pedido.");

    await db.from("order_items").delete().eq("order_id", order.id);
    const merged = new Map<string, number>();
    data.items.forEach((i) => merged.set(i.product_id, Math.min(99, (merged.get(i.product_id) ?? 0) + i.quantity)));
    const { error: itemsErr } = await db
      .from("order_items")
      .insert([...merged].map(([product_id, quantity]) => ({ order_id: order.id, product_id, quantity })));
    if (itemsErr) throw new Error("Não foi possível salvar os itens do pedido.");
    return { ok: true };
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
