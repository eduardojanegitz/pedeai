import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isAllowedPushEndpoint } from "@/lib/order-status";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const tokenSchema = z.string().min(32).max(128);
const endpointSchema = z
  .string()
  .url()
  .max(1000)
  .refine(isAllowedPushEndpoint, "Endereço inválido");

/** Chave pública VAPID (não é segredo). `null` = notificação não configurada neste servidor. */
export const getPushConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ publicKey: string | null }> => {
    const { vapidFromEnv } = await import("@/lib/webpush.server");
    return { publicKey: vapidFromEnv()?.publicKey ?? null };
  },
);

async function participantId(db: Awaited<ReturnType<typeof admin>>, token: string) {
  const sec = await import("@/lib/participant-security.server");
  const { data } = await db
    .from("participants")
    .select("id")
    .eq("token_hash", await sec.sha256Hex(token))
    .maybeSingle();
  return data?.id ?? null;
}

/** Guarda a inscrição de push do aparelho do participante. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: tokenSchema, endpoint: endpointSchema }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    const sec = await import("@/lib/participant-security.server");
    if (!(await sec.withinRateLimit(db, "push-sub", 20, 60))) return { ok: false };
    const id = await participantId(db, data.token);
    if (!id) return { ok: false };
    // Limite por participante: mantém só as 5 inscrições mais recentes (vários aparelhos).
    const { error } = await db
      .from("push_subscriptions")
      .upsert({ participant_id: id, endpoint: data.endpoint }, { onConflict: "endpoint" });
    if (error) {
      console.error(error);
      return { ok: false };
    }
    const { data: all } = await db
      .from("push_subscriptions")
      .select("id")
      .eq("participant_id", id)
      .order("created_at", { ascending: false });
    const extra = (all ?? []).slice(5).map((r) => r.id);
    if (extra.length) await db.from("push_subscriptions").delete().in("id", extra);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: tokenSchema, endpoint: endpointSchema }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    const id = await participantId(db, data.token);
    if (!id) return { ok: false };
    await db
      .from("push_subscriptions")
      .delete()
      .eq("participant_id", id)
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });
