// Somente servidor: segredos, hash do código de recuperação, IP e limite de requisições.
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

/**
 * Chave do HMAC do código de recuperação. Prefira definir RECOVERY_PEPPER (texto longo e aleatório);
 * sem ela, usa a SERVICE_ROLE_KEY (trocá-la invalida os códigos já emitidos).
 */
function pepper(): string {
  const p = process.env["RECOVERY_PEPPER"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!p) throw new Error("Configuração do servidor incompleta.");
  return p;
}

export async function hashRecoveryCode(normalizedCode: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pepper()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`recovery:${normalizedCode}`)));
}

function timingSafeEqualHex(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Sempre calcula o HMAC (mesmo sem participante) para o tempo de resposta não revelar se o celular existe. */
export async function verifyRecoveryCode(normalizedCode: string, storedHash: string | null): Promise<boolean> {
  const computed = await hashRecoveryCode(normalizedCode);
  const same = timingSafeEqualHex(computed, storedHash ?? "0".repeat(64));
  return same && storedHash !== null;
}

/** IP do cliente. Atrás da Cloudflare, `cf-connecting-ip` é confiável; senão usa o primeiro X-Forwarded-For. */
function clientIp(): string {
  const h = getRequest()?.headers;
  const cf = h?.get("cf-connecting-ip");
  if (cf) return cf;
  return h?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** true = pode seguir; false = excedeu o limite. O IP nunca é guardado em texto (só o hash). */
export async function withinRateLimit(
  db: SupabaseClient<Database>,
  action: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = `${action}:${await sha256Hex(clientIp())}`;
  const { data, error } = await db.rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
    console.error(error);
    throw new Error("Não foi possível processar agora. Tente novamente em instantes.");
  }
  return data === true;
}
