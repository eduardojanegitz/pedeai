import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseBrazilianMobile } from "@/lib/phone";
import { generateRecoveryCode, isWellFormedRecoveryCode, normalizeRecoveryCode } from "@/lib/recovery-code";

// Identificação por nome + celular. O celular NÃO é prova de identidade: quem já tem cadastro só
// volta (em outro aparelho) com o código de recuperação, que é mostrado uma única vez.

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function security() {
  return import("@/lib/participant-security.server");
}

const tokenSchema = z.string().min(32).max(128);
const nameSchema = z.string().trim().min(1, "Informe seu nome").max(60);
const phoneSchema = z.string().trim().min(1).max(30);

export type IdentifyResult =
  | { status: "created"; recoveryCode: string }
  | { status: "exists" }
  | { status: "invalid_phone"; message: string }
  | { status: "rate_limited" };

/**
 * Primeiro acesso: cria o participante e devolve o código de recuperação (única vez em que ele existe em texto).
 * Se o celular já estiver cadastrado, responde `exists` e o cliente leva a pessoa à recuperação por código.
 * Isso revela apenas "este celular já tem cadastro", e o limite de requisições por IP restringe a varredura.
 */
export const identifyParticipant = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ name: nameSchema, phone: phoneSchema, token: tokenSchema }).parse(d))
  .handler(async ({ data }): Promise<IdentifyResult> => {
    const db = await admin();
    const sec = await security();
    if (!(await sec.withinRateLimit(db, "identify", 10, 600))) return { status: "rate_limited" };

    const phone = parseBrazilianMobile(data.phone);
    if (!phone.ok) return { status: "invalid_phone", message: phone.message };

    const code = generateRecoveryCode();
    const { error } = await db.from("participants").insert({
      display_name: data.name,
      token_hash: await sec.sha256Hex(data.token),
      phone_e164: phone.e164,
      recovery_hash: await sec.hashRecoveryCode(normalizeRecoveryCode(code)),
    });
    if (error) {
      if (error.code === "23505") return { status: "exists" };
      console.error(error);
      throw new Error("Não foi possível concluir seu cadastro. Tente novamente.");
    }
    return { status: "created", recoveryCode: code };
  });

export type RecoverResult =
  | { status: "recovered"; name: string }
  | { status: "invalid" }
  | { status: "invalid_phone"; message: string }
  | { status: "rate_limited" };

/**
 * Recupera o cadastro em outro aparelho: celular + código. Resposta única ("invalid") para celular
 * desconhecido, código errado ou conta bloqueada; 5 erros bloqueiam o celular por 15 min.
 * O aparelho novo passa a ser o aparelho ativo (o token anterior deixa de valer).
 */
export const recoverParticipant = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ phone: phoneSchema, code: z.string().max(40), token: tokenSchema }).parse(d))
  .handler(async ({ data }): Promise<RecoverResult> => {
    const db = await admin();
    const sec = await security();
    if (!(await sec.withinRateLimit(db, "recover", 10, 600))) return { status: "rate_limited" };

    const phone = parseBrazilianMobile(data.phone);
    if (!phone.ok) return { status: "invalid_phone", message: phone.message };

    const { data: rows, error } = await db.rpc("begin_recovery", { p_phone: phone.e164 });
    if (error) {
      console.error(error);
      throw new Error("Não foi possível processar agora. Tente novamente em instantes.");
    }
    const row = rows?.[0] ?? null;
    const code = normalizeRecoveryCode(data.code);
    const matches = await sec.verifyRecoveryCode(code, row?.recovery_hash ?? null);
    if (!row || !matches || !isWellFormedRecoveryCode(data.code)) return { status: "invalid" };

    const { error: finishErr } = await db.rpc("finish_recovery", {
      p_participant: row.participant_id,
      p_token_hash: await sec.sha256Hex(data.token),
    });
    if (finishErr) {
      console.error(finishErr);
      throw new Error("Não foi possível concluir a recuperação. Tente novamente.");
    }
    const { data: p } = await db.from("participants").select("display_name").eq("id", row.participant_id).single();
    return { status: "recovered", name: p?.display_name ?? "" };
  });

async function currentParticipant(db: Awaited<ReturnType<typeof admin>>, sha256Hex: (t: string) => Promise<string>, token: string) {
  const { data } = await db
    .from("participants")
    .select("id, phone_e164")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  return data;
}

export type CodeResult =
  | { status: "created"; recoveryCode: string }
  | { status: "exists" }
  | { status: "already" }
  | { status: "not_found" }
  | { status: "invalid_phone"; message: string }
  | { status: "rate_limited" };

/** Participante antigo (sem celular): vincula o celular e gera o código de recuperação. */
export const attachPhone = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ phone: phoneSchema, token: tokenSchema }).parse(d))
  .handler(async ({ data }): Promise<CodeResult> => {
    const db = await admin();
    const sec = await security();
    if (!(await sec.withinRateLimit(db, "attach", 10, 600))) return { status: "rate_limited" };

    const me = await currentParticipant(db, sec.sha256Hex, data.token);
    if (!me) return { status: "not_found" };
    if (me.phone_e164) return { status: "already" };

    const phone = parseBrazilianMobile(data.phone);
    if (!phone.ok) return { status: "invalid_phone", message: phone.message };

    const code = generateRecoveryCode();
    const { error } = await db
      .from("participants")
      .update({ phone_e164: phone.e164, recovery_hash: await sec.hashRecoveryCode(normalizeRecoveryCode(code)) })
      .eq("id", me.id)
      .is("phone_e164", null);
    if (error) {
      if (error.code === "23505") return { status: "exists" };
      console.error(error);
      throw new Error("Não foi possível salvar seu celular. Tente novamente.");
    }
    return { status: "created", recoveryCode: code };
  });

/** Quem perdeu o código mas ainda está logado neste aparelho pode gerar outro (o anterior deixa de valer). */
export const rotateRecoveryCode = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }): Promise<CodeResult> => {
    const db = await admin();
    const sec = await security();
    if (!(await sec.withinRateLimit(db, "rotate", 10, 600))) return { status: "rate_limited" };

    const me = await currentParticipant(db, sec.sha256Hex, data.token);
    if (!me) return { status: "not_found" };
    if (!me.phone_e164) return { status: "invalid_phone", message: "Cadastre seu celular primeiro." };

    const code = generateRecoveryCode();
    const { error } = await db
      .from("participants")
      .update({ recovery_hash: await sec.hashRecoveryCode(normalizeRecoveryCode(code)), recovery_attempts: 0, locked_until: null })
      .eq("id", me.id);
    if (error) {
      console.error(error);
      throw new Error("Não foi possível gerar um novo código. Tente novamente.");
    }
    return { status: "created", recoveryCode: code };
  });
