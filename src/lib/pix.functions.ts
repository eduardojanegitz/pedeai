import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-middleware";
import { maskPixKey, normalizePixKey, pixText, type PixKeyType } from "@/lib/pix";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PixSettings = {
  type: PixKeyType;
  key: string;
  name: string;
  city: string;
};
export type PixSettingsView = {
  /** null = este organizador ainda não configurou o Pix. */
  settings: PixSettings | null;
  /** Últimas trocas de chave (valores mascarados). */
  audit: { changedAt: string; oldKey: string | null; newKey: string | null }[];
};

const KEY_TYPES = ["cpf", "cnpj", "email", "phone", "random"] as const;

/** Pix do organizador logado (cada um configura o seu). */
export const getPixSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<PixSettingsView> => {
    const db = await admin();
    const { data: row, error } = await db
      .from("admin_settings")
      .select("pix_key, pix_key_type, pix_name, pix_city")
      .eq("admin_id", context.adminId)
      .maybeSingle();
    if (error) throw new Error("Não foi possível carregar os ajustes.");
    const { data: audit } = await db
      .from("pix_key_audit")
      .select("changed_at, old_key_masked, new_key_masked")
      .eq("admin_id", context.adminId)
      .order("changed_at", { ascending: false })
      .limit(5);
    return {
      settings:
        row?.pix_key && row.pix_key_type && row.pix_name && row.pix_city
          ? {
              type: row.pix_key_type as PixKeyType,
              key: row.pix_key,
              name: row.pix_name,
              city: row.pix_city,
            }
          : null,
      audit: (audit ?? []).map((a) => ({
        changedAt: a.changed_at,
        oldKey: a.old_key_masked,
        newKey: a.new_key_masked,
      })),
    };
  });

/** Valida e grava o Pix. Toda troca de chave fica registrada (mascarada). */
export const savePixSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) =>
    z
      .object({
        type: z.enum(KEY_TYPES),
        key: z.string().max(120),
        name: z.string().max(80),
        city: z.string().max(60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const k = normalizePixKey(data.type, data.key);
    if (!k.ok) throw new Error(k.error);
    const name = pixText(data.name, 25);
    const city = pixText(data.city, 15);
    if (!name) throw new Error("Informe o nome do recebedor (como aparece no banco).");
    if (!city) throw new Error("Informe a cidade do recebedor.");

    const db = await admin();
    const { data: current } = await db
      .from("admin_settings")
      .select("pix_key, pix_key_type")
      .eq("admin_id", context.adminId)
      .maybeSingle();
    const { error } = await db.from("admin_settings").upsert({
      admin_id: context.adminId,
      pix_key: k.key,
      pix_key_type: data.type,
      pix_name: name,
      pix_city: city,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Não foi possível salvar o Pix.");
    if (current?.pix_key !== k.key) {
      await db.from("pix_key_audit").insert({
        admin_id: context.adminId,
        old_key_masked:
          current?.pix_key && current.pix_key_type
            ? maskPixKey(current.pix_key_type as PixKeyType, current.pix_key)
            : null,
        new_key_masked: maskPixKey(data.type, k.key),
      });
    }
    return { ok: true, key: k.key, name, city };
  });

/** Remove o Pix do organizador (os participantes deixam de ver o pagamento). */
export const clearPixSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: current } = await db
      .from("admin_settings")
      .select("pix_key, pix_key_type")
      .eq("admin_id", context.adminId)
      .maybeSingle();
    const { error } = await db
      .from("admin_settings")
      .update({
        pix_key: null,
        pix_key_type: null,
        pix_name: null,
        pix_city: null,
        updated_at: new Date().toISOString(),
      })
      .eq("admin_id", context.adminId);
    if (error) throw new Error("Não foi possível remover o Pix.");
    if (current?.pix_key && current.pix_key_type) {
      await db.from("pix_key_audit").insert({
        admin_id: context.adminId,
        old_key_masked: maskPixKey(current.pix_key_type as PixKeyType, current.pix_key),
        new_key_masked: null,
      });
    }
    return { ok: true };
  });
