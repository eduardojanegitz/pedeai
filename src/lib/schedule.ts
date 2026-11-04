import { z } from "zod";

const TZ = "America/Sao_Paulo";
const iso = z.string().datetime({ offset: true });

/** Janela de pedidos. null = sem limite naquele lado. Abertura precisa vir antes do encerramento. */
export const scheduleSchema = z
  .object({ opensAt: iso.nullable(), closesAt: iso.nullable() })
  .refine((s) => !s.opensAt || !s.closesAt || Date.parse(s.closesAt) > Date.parse(s.opensAt), {
    path: ["closesAt"],
    message: "O encerramento precisa ser depois da abertura",
  });

/**
 * "2026-11-04T11:30" (campo datetime-local, hora de Brasília) -> ISO UTC.
 * O Brasil não tem horário de verão desde 2019, então Brasília é sempre UTC-03:00.
 * Independe do fuso do navegador de quem configura.
 */
export function spLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO -> "YYYY-MM-DDTHH:mm" na hora de Brasília (valor do campo datetime-local). */
export function isoToSpLocal(isoString: string | null): string {
  if (!isoString) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(isoString));
  return parts.replace(" ", "T");
}
