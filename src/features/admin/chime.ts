import type { AlertKind } from "./order-alerts";

/** Notas de cada som: [frequência em Hz, início em s, duração em s]. */
const SOUNDS: Record<AlertKind, [number, number, number][]> = {
  // Pedido novo: três notas subindo, bem perceptível.
  new: [
    [659.25, 0, 0.16],
    [880, 0.17, 0.16],
    [1318.5, 0.34, 0.42],
  ],
  // Editado: duas notas iguais, mais discretas.
  edited: [
    [783.99, 0, 0.14],
    [783.99, 0.2, 0.2],
  ],
  // Cancelado: duas notas descendo, grave.
  cancelled: [
    [440, 0, 0.18],
    [330, 0.2, 0.32],
  ],
};

type Ctor = typeof AudioContext;
const getCtor = (): Ctor | null =>
  typeof window === "undefined"
    ? null
    : (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ??
      null);

let ctx: AudioContext | null = null;

/** Este navegador sabe tocar sons? */
export const soundSupported = () => getCtor() !== null;

/**
 * Libera o som. Os navegadores só permitem áudio depois de um clique, então chame isto DENTRO de um
 * clique do usuário. Devolve true se o som ficou liberado.
 */
export async function unlockSound(): Promise<boolean> {
  const Ctx = getCtor();
  if (!Ctx) return false;
  try {
    ctx ??= new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

/** O som já está liberado (contexto de áudio ativo)? */
export const soundReady = () => ctx?.state === "running";

/** Toca o som do tipo pedido. `volume` de 0 a 1. Devolve false se o navegador bloqueou o áudio. */
export function playChime(kind: AlertKind, volume: number): boolean {
  if (!ctx || ctx.state !== "running") return false;
  const v = Math.min(1, Math.max(0, volume));
  const now = ctx.currentTime;
  for (const [freq, start, dur] of SOUNDS[kind]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Envelope curto para não "estalar": sobe rápido, decai suave.
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.5 * v), now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.05);
  }
  return true;
}
