import { formatSaoPaulo } from "@/lib/format";
import type { RoundState } from "@/lib/orders.functions";

const STORAGE_KEY = "pedeai:public-url";

/**
 * Normaliza o endereço público do site: aceita "meusite.com.br", "http(s)://…" e devolve só a origem
 * (sem caminho, parâmetros ou barra final). Devolve null se não for um endereço http(s) válido.
 */
export function normalizePublicUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname) return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Endereço que só funciona neste computador (ambiente de desenvolvimento). */
export function isLocalAddress(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".local");
  } catch {
    return false;
  }
}

/** Endereço salvo neste navegador (se o painel é aberto por um endereço diferente do público). */
export function loadPublicUrl(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? normalizePublicUrl(v) : null;
  } catch {
    return null;
  }
}
export function savePublicUrl(url: string | null) {
  try {
    if (url) localStorage.setItem(STORAGE_KEY, url);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* vale só nesta sessão */
  }
}

type MessageInput = {
  name: string;
  link: string;
  state: RoundState;
  opensAt: string | null;
  closesAt: string | null;
};

/** Mensagem pronta para colar no grupo (negrito no padrão do WhatsApp). */
export function whatsappMessage({ name, link, state, opensAt, closesAt }: MessageInput): string {
  const lines = [
    `🍽️ *${name}* — pedidos ${state === "waiting" ? "em breve" : "abertos"}!`,
    "",
    `Faça seu pedido: ${link}`,
  ];
  if (state === "waiting" && opensAt) lines.push(`🕒 Abre ${formatSaoPaulo(opensAt)}`);
  if (closesAt) lines.push(`⏰ Pedidos até ${formatSaoPaulo(closesAt)}`);
  return lines.join("\n");
}

/** Abre o WhatsApp (app ou web) com a mensagem pronta, para escolher o grupo ou contato. */
export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
