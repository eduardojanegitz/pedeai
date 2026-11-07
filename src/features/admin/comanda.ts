import type { RoundOrder } from "@/lib/orders.functions";

export type PaperSize = "80mm" | "58mm" | "a4";
export type ComandaMode = "kitchen" | "people";

export const PAPERS: Record<
  PaperSize,
  {
    label: string;
    hint: string;
    /** Largura da página em mm (bobinas); null = folha A4. */
    pageWidthMm: number | null;
    margin: string;
  }
> = {
  "80mm": { label: "Térmica 80 mm", hint: "Bobina comum de balcão", pageWidthMm: 80, margin: "0" },
  "58mm": { label: "Térmica 58 mm", hint: "Bobina estreita", pageWidthMm: 58, margin: "0" },
  a4: {
    label: "Folha A4",
    hint: "Qualquer impressora",
    pageWidthMm: null,
    margin: "12mm",
  },
};

export type PrintOptions = {
  mode: ComandaMode;
  paper: PaperSize;
  /** Incluir o celular do participante (só na comanda por pessoa). */
  showPhone: boolean;
  /** Incluir valores (só quando há preços). */
  showPrices: boolean;
  /** Comanda por pessoa: imprimir só os pedidos que mudaram desde a última impressão. */
  onlyChanged: boolean;
};

export const defaultPrintOptions: PrintOptions = {
  mode: "kitchen",
  paper: "80mm",
  showPhone: false,
  showPrices: false,
  onlyChanged: false,
};

const time = (iso: string) => Date.parse(iso);

/** Instante mais recente entre criação e edição dos pedidos (o "até quando" os dados vão). */
export function snapshotInstant(orders: RoundOrder[]): string | null {
  let max = -Infinity;
  for (const o of orders) max = Math.max(max, time(o.created_at), time(o.updated_at));
  return Number.isFinite(max) ? new Date(max).toISOString() : null;
}

export type ChangeKind = "new" | "edited";

/**
 * Pedidos criados ou editados DEPOIS da última impressão. Sem impressão anterior, nada é marcado
 * (não faz sentido avisar "mudou" de algo que nunca saiu no papel).
 */
export function changedSincePrint(
  orders: RoundOrder[],
  lastPrintedAt: string | null,
): Map<string, ChangeKind> {
  const out = new Map<string, ChangeKind>();
  if (!lastPrintedAt) return out;
  const since = time(lastPrintedAt);
  for (const o of orders) {
    if (time(o.created_at) > since) out.set(o.order_id, "new");
    else if (time(o.updated_at) > since) out.set(o.order_id, "edited");
  }
  return out;
}

/** Pedidos que entram na folha conforme as opções. */
export function ordersToPrint(
  orders: RoundOrder[],
  opts: PrintOptions,
  changed: Map<string, ChangeKind>,
): RoundOrder[] {
  if (opts.mode === "people" && opts.onlyChanged)
    return orders.filter((o) => changed.has(o.order_id));
  return orders;
}

/** Valor do pedido em centavos, ou null se nenhum item tem preço. */
export function orderTotal(o: RoundOrder): number | null {
  let total = 0;
  let any = false;
  for (const i of o.items) {
    if (i.price_cents != null) {
      total += i.price_cents * i.quantity;
      any = true;
    }
  }
  return any ? total : null;
}

/** Altura usada quando não dá para medir (ex.: testes sem layout). */
export const FALLBACK_ROLL_HEIGHT_MM = 297;
const PX_TO_MM = 25.4 / 96;

/**
 * Regra @page do papel. Atenção: o Chrome ignora `80mm auto` e volta para Carta; por isso as
 * bobinas levam largura E altura explícitas (a altura vem de `rollHeightMm`).
 */
export function pageCss(paper: PaperSize, heightMm: number | null): string {
  const p = PAPERS[paper];
  if (p.pageWidthMm === null) return `@page { size: A4; margin: ${p.margin}; }`;
  return `@page { size: ${p.pageWidthMm}mm ${heightMm ?? FALLBACK_ROLL_HEIGHT_MM}mm; margin: ${p.margin}; }`;
}

/**
 * Altura de página (mm) para a bobina, medida na folha já renderizada com a largura do papel:
 * - consolidada: a folha inteira;
 * - por pessoa: a maior "página" (a 1ª leva o cabeçalho junto do 1º ticket).
 * Devolve null se não houver layout (altura 0).
 */
export function rollHeightMm(sheet: HTMLElement): number | null {
  const top = sheet.getBoundingClientRect().top;
  const tickets = [...sheet.querySelectorAll<HTMLElement>(".comanda__ticket")];
  let px: number;
  if (tickets.length === 0) {
    px = sheet.getBoundingClientRect().height;
  } else {
    const firstPage = tickets[0]!.getBoundingClientRect().bottom - top;
    const tallest = Math.max(...tickets.map((t) => t.getBoundingClientRect().height));
    px = Math.max(firstPage, tallest) + 48; // rodapé e respiro
  }
  if (!(px > 0)) return null;
  return Math.min(2000, Math.max(50, Math.ceil(px * PX_TO_MM + 8)));
}
