import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendPush, vapidFromEnv } from "@/lib/webpush.server";

/**
 * Avisa o participante (todos os aparelhos inscritos) que o pedido ficou pronto.
 * Nunca lança: uma falha de push não pode impedir de marcar o pedido como concluído.
 */
export async function notifyOrderReady(
  db: SupabaseClient<Database>,
  participantId: string,
): Promise<void> {
  try {
    const cfg = vapidFromEnv();
    if (!cfg) return;
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("id, endpoint")
      .eq("participant_id", participantId);
    if (!subs?.length) return;
    const results = await Promise.all(subs.map((s) => sendPush(cfg, s.endpoint)));
    const gone = subs.filter((_, i) => results[i] === "gone").map((s) => s.id);
    if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  } catch (e) {
    console.error("notifyOrderReady", e instanceof Error ? e.message : e);
  }
}
