import { formatSaoPaulo } from "@/lib/format";

/** Link do WhatsApp para uma conversa com o número (E.164 "+55…") e texto pronto. null se o número for inválido. */
export function whatsappToLink(e164: string, text: string): string | null {
  const digits = e164.replace(/\D/g, "");
  if (!/^55[1-9][1-9]9\d{8}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/** Mensagem de lembrete. `{nome}` é trocado pelo primeiro nome de cada pessoa. */
export function reminderTemplate(input: {
  roundName: string;
  link: string;
  closesAt: string | null;
}): string {
  const lines = [
    `Oi, {nome}! 🍽️ Os pedidos da *${input.roundName}* estão abertos e ainda não vi o seu.`,
    "",
    `Faça seu pedido: ${input.link}`,
  ];
  if (input.closesAt) lines.push(`⏰ Pedidos até ${formatSaoPaulo(input.closesAt)}`);
  return lines.join("\n");
}

export const applyName = (template: string, name: string) =>
  template.replaceAll("{nome}", firstName(name));

/** "1 h 20 min", "35 min", "menos de 1 min"; null se já passou ou não há prazo. */
export function countdownText(closesAt: string | null, nowMs: number): string | null {
  if (!closesAt) return null;
  const left = Date.parse(closesAt) - nowMs;
  if (!(left > 0)) return null;
  const mins = Math.floor(left / 60_000);
  if (mins < 1) return "menos de 1 min";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  const days = Math.floor(h / 24);
  if (days >= 1) return `${days} d ${h % 24} h`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
