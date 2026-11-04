// Classes compartilhadas da jornada do participante (identidade "Feira Vibrante").
export const btn =
  "pop-press inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-foreground px-5 py-2.5 font-bold shadow-pop disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
export const btnPrimary = `${btn} bg-primary text-primary-foreground`;
export const btnPlain = `${btn} bg-card`;
export const input =
  "w-full rounded-2xl border-2 border-foreground bg-card px-4 py-3.5 text-lg outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : "Algo deu errado. Tente de novo.";
