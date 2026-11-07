import type { MenuCategory, MenuProduct } from "@/lib/catalog.functions";
import { cleanNote } from "@/lib/order-note";

/** Carrinho: id do produto -> quantidade. */
export type Cart = Record<string, number>;

/** Observações: id do produto -> texto livre (só vale para produtos que estão no carrinho). */
export type Notes = Record<string, string>;

/** Uma etapa do pedido = uma categoria ativa que tenha ao menos um produto ativo. */
export type Step = { category: MenuCategory; products: MenuProduct[] };

export function buildSteps(categories: MenuCategory[], products: MenuProduct[]): Step[] {
  return [...categories]
    .filter((c) => c.is_active)
    .sort((a, b) => a.position - b.position)
    .map((category) => ({
      category,
      products: products.filter((p) => p.is_active && p.category_id === category.id),
    }))
    .filter((s) => s.products.length > 0);
}

/** Quantas OPÇÕES DIFERENTES da etapa estão no carrinho (é isto que conta para o limite). */
export function pickedCount(cart: Cart, step: Step): number {
  return step.products.filter((p) => (cart[p.id] ?? 0) > 0).length;
}

export type StepStatus = {
  picked: number;
  min: number;
  max: number;
  /** Mínimo atingido. */
  satisfied: boolean;
  /** Máximo atingido: novas opções ficam bloqueadas. */
  full: boolean;
  /** Acima do máximo (o admin reduziu o limite depois da escolha). */
  over: boolean;
};

export function stepStatus(cart: Cart, step: Step): StepStatus {
  const picked = pickedCount(cart, step);
  const { min_select: min, max_select: max } = step.category;
  return { picked, min, max, satisfied: picked >= min, full: picked >= max, over: picked > max };
}

/** Pode escolher mais uma opção nesta etapa? (opção ainda não escolhida e limite não atingido) */
export function canAdd(cart: Cart, step: Step, productId: string): boolean {
  if ((cart[productId] ?? 0) > 0) return false;
  return !stepStatus(cart, step).full;
}

/** Etapas que impedem a confirmação: abaixo do mínimo ou acima do máximo. */
export type InvalidStep = { step: Step; reason: "min" | "max" };

export function invalidSteps(cart: Cart, steps: Step[]): InvalidStep[] {
  return steps.flatMap((step): InvalidStep[] => {
    const s = stepStatus(cart, step);
    if (!s.satisfied) return [{ step, reason: "min" as const }];
    if (s.over) return [{ step, reason: "max" as const }];
    return [];
  });
}

export function selectedLines(cart: Cart, step: Step) {
  return step.products
    .filter((p) => (cart[p.id] ?? 0) > 0)
    .map((product) => ({ product, quantity: cart[product.id] ?? 0 }));
}

export function totalItems(cart: Cart, steps: Step[]): number {
  return steps.reduce((n, s) => n + pickedCount(cart, s), 0);
}

/** Total em centavos, ou null se nenhum item escolhido tem preço (a tela então não mostra valores). */
export function totalCents(cart: Cart, steps: Step[]): number | null {
  let total = 0;
  let any = false;
  for (const s of steps) {
    for (const { product, quantity } of selectedLines(cart, s)) {
      if (product.price_cents != null) {
        total += product.price_cents * quantity;
        any = true;
      }
    }
  }
  return any ? total : null;
}

/** Em unidades: no pedido, opções repetidas contam pela quantidade. */
export function cartLinesForServer(cart: Cart, steps: Step[], notes: Notes = {}) {
  return steps.flatMap((s) =>
    selectedLines(cart, s).map(({ product, quantity }) => ({
      product_id: product.id,
      quantity,
      note: cleanNote(notes[product.id]),
    })),
  );
}

// ---------- Textos ----------

const lower = (s: string) => s.toLocaleLowerCase("pt-BR");

/** "Escolha 1 prato principal" · "Escolha 2 acompanhamentos" · "Escolha de 1 a 3 em Bebidas" · "Escolha até 2 em Extras (opcional)". */
export function stepTitle(c: MenuCategory): string {
  const { min_select: min, max_select: max, name } = c;
  if (min === max) return `Escolha ${max} ${lower(name)}`;
  if (min === 0) return `Escolha até ${max} em ${name} (opcional)`;
  return `Escolha de ${min} a ${max} em ${name}`;
}

/** "1 de 2 selecionados" (quando mínimo = máximo) ou "1 selecionado · mín. 1 · máx. 3". */
export function counterText(s: StepStatus): string {
  const noun = (n: number) => (n === 1 ? "selecionado" : "selecionados");
  if (s.min === s.max) return `${s.picked} de ${s.max} ${noun(s.max)}`;
  return `${s.picked} ${noun(s.picked)} · mín. ${s.min} · máx. ${s.max}`;
}

/** Mensagem de limite atingido. */
export function limitMessage(c: MenuCategory): string {
  const { max_select: max, name } = c;
  return max === 1
    ? `Você já escolheu em ${name}!`
    : `Você já escolheu seus ${max} ${lower(name)}!`;
}

/** Quanto falta para o mínimo, ex.: "Faltam 1 em Acompanhamentos". */
export function missingText(c: MenuCategory, s: StepStatus): string {
  const n = s.min - s.picked;
  return `Falta${n > 1 ? "m" : ""} ${n} em ${c.name}`;
}
