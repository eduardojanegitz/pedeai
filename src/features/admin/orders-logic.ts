import type { RoundOrder, RoundOrderItem } from "@/lib/orders.functions";

export type OrderFilters = {
  search: string;
  /** Nome da categoria ("" = todas; "__none" = sem categoria). */
  category: string;
  /** Id do produto ("" = todos). */
  productId: string;
  editedOnly: boolean;
  /** Pagamento: "" = todos, "pending" = a receber, "paid" = pagos. */
  payment: "" | "pending" | "paid";
};

export const NO_CATEGORY = "__none";
export const emptyFilters: OrderFilters = {
  search: "",
  category: "",
  productId: "",
  editedOnly: false,
  payment: "",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

/**
 * Filtra pedidos. Com filtro de categoria/produto, mantém só os pedidos que têm esse item
 * e mostra apenas os itens correspondentes (para ver "quem pediu Lasanha").
 */
export function filterOrders(orders: RoundOrder[], f: OrderFilters): RoundOrder[] {
  const q = norm(f.search.trim());
  return orders.flatMap((o) => {
    if (f.editedOnly && !o.edited) return [];
    if (f.payment === "paid" && !o.paid_at) return [];
    if (f.payment === "pending" && o.paid_at) return [];
    if (
      q &&
      !norm(o.participant).includes(q) &&
      !(o.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000")
    ) {
      return [];
    }
    const matches = (i: RoundOrderItem) =>
      (!f.category ||
        (f.category === NO_CATEGORY ? i.category === null : i.category === f.category)) &&
      (!f.productId || i.product_id === f.productId);
    if (!f.category && !f.productId) return [o];
    const items = o.items.filter(matches);
    return items.length ? [{ ...o, items }] : [];
  });
}

export type CategoryGroup<T> = { category: string | null; position: number; items: T[] };

/** Agrupa itens por categoria, na ordem configurada (sem categoria por último). */
export function groupByCategory<T extends { category: string | null; category_position: number }>(
  items: T[],
): CategoryGroup<T>[] {
  const map = new Map<string, CategoryGroup<T>>();
  for (const i of items) {
    const key = i.category ?? NO_CATEGORY;
    const g = map.get(key) ?? { category: i.category, position: i.category_position, items: [] };
    g.items.push(i);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.position - b.position);
}

export type ConsolidatedProduct = {
  product_id: string;
  product: string;
  quantity: number;
  people: string[];
  /** Observações dos participantes ("sem cebola" · quem pediu). */
  notes: { text: string; person: string }[];
  revenue: number | null;
};
export type ConsolidatedCategory = {
  category: string | null;
  position: number;
  quantity: number;
  products: ConsolidatedProduct[];
};

/** Quantidade por categoria e por produto (e quem pediu cada um). */
export function consolidate(orders: RoundOrder[]): ConsolidatedCategory[] {
  const cats = new Map<string, ConsolidatedCategory>();
  for (const o of orders) {
    for (const i of o.items) {
      const key = i.category ?? NO_CATEGORY;
      const c = cats.get(key) ?? {
        category: i.category,
        position: i.category_position,
        quantity: 0,
        products: [],
      };
      let p = c.products.find((x) => x.product_id === i.product_id);
      if (!p) {
        p = {
          product_id: i.product_id,
          product: i.product,
          quantity: 0,
          people: [],
          notes: [],
          revenue: null,
        };
        c.products.push(p);
      }
      p.quantity += i.quantity;
      p.people.push(o.participant);
      if (i.note) p.notes.push({ text: i.note, person: o.participant });
      if (i.price_cents != null) p.revenue = (p.revenue ?? 0) + i.price_cents * i.quantity;
      c.quantity += i.quantity;
      cats.set(key, c);
    }
  }
  return [...cats.values()]
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      ...c,
      products: c.products.sort(
        (a, b) => b.quantity - a.quantity || a.product.localeCompare(b.product, "pt-BR"),
      ),
    }));
}

/** Valor do pedido em centavos (itens sem preço não contam), ou null se nenhum item tem preço. */
export function orderValue(o: RoundOrder): number | null {
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

export function summarize(orders: RoundOrder[]) {
  const items = orders.reduce((n, o) => n + o.items.reduce((m, i) => m + i.quantity, 0), 0);
  const edited = orders.filter((o) => o.edited).length;
  const values = orders.map((o) => ({ paid: o.paid_at !== null, value: orderValue(o) }));
  const priced = values.some((v) => v.value !== null);
  const sum = (paid: boolean) =>
    values.filter((v) => v.paid === paid).reduce((s, v) => s + (v.value ?? 0), 0);
  return {
    orders: orders.length,
    items,
    edited,
    totalCents: priced ? sum(true) + sum(false) : null,
    /** Recebido (pedidos marcados como pagos) e a receber; null se não há preços. */
    paidCents: priced ? sum(true) : null,
    pendingCents: priced ? sum(false) : null,
    paidOrders: orders.filter((o) => o.paid_at !== null).length,
  };
}
