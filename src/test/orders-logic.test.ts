import { describe, expect, it } from "vitest";

import {
  consolidate,
  emptyFilters,
  filterOrders,
  groupByCategory,
  NO_CATEGORY,
  summarize,
} from "@/features/admin/orders-logic";
import { moveId } from "@/features/admin/reorder";
import type { RoundOrder } from "@/lib/orders.functions";

const it_ = (
  product_id: string,
  product: string,
  category: string | null,
  pos: number,
  quantity = 1,
  price: number | null = null,
  note: string | null = null,
) => ({
  product_id,
  product,
  category,
  category_position: pos,
  price_cents: price,
  quantity,
  note,
});
const order = (
  id: string,
  participant: string,
  items: RoundOrder["items"],
  edited = false,
  phone: string | null = null,
): RoundOrder => ({
  order_id: id,
  participant_id: `p-${id}`,
  participant,
  phone,
  created_at: "2026-11-04T12:00:00Z",
  updated_at: "2026-11-04T12:30:00Z",
  edited,
  paid_at: null,
  items,
});

const orders = [
  order(
    "1",
    "João Silva",
    [
      it_("f", "Frango", "Prato principal", 0, 1, 2800),
      it_("a", "Arroz", "Acompanhamentos", 1),
      it_("p", "Purê", "Acompanhamentos", 1),
    ],
    false,
    "(15) 99999-9999",
  ),
  order(
    "2",
    "Maria",
    [
      it_("l", "Lasanha", "Prato principal", 0, 1, 3200),
      it_("a", "Arroz", "Acompanhamentos", 1),
      it_("fa", "Farofa", "Acompanhamentos", 1),
    ],
    true,
  ),
  order("3", "Zé Ângelo", [it_("x", "Brinde", null, 9999)]),
];

describe("filtros de pedidos", () => {
  it("sem filtros devolve tudo", () => {
    expect(filterOrders(orders, emptyFilters)).toHaveLength(3);
  });
  it("busca por nome ignora acento e caixa", () => {
    expect(
      filterOrders(orders, { ...emptyFilters, search: "ze angelo" }).map((o) => o.participant),
    ).toEqual(["Zé Ângelo"]);
    expect(filterOrders(orders, { ...emptyFilters, search: "MARIA" })).toHaveLength(1);
  });
  it("busca por celular (só dígitos)", () => {
    expect(
      filterOrders(orders, { ...emptyFilters, search: "99999-9999" }).map((o) => o.participant),
    ).toEqual(["João Silva"]);
  });
  it("somente editados", () => {
    expect(
      filterOrders(orders, { ...emptyFilters, editedOnly: true }).map((o) => o.participant),
    ).toEqual(["Maria"]);
  });
  it("filtro de produto mostra quem pediu e só o item", () => {
    const r = filterOrders(orders, { ...emptyFilters, productId: "a" });
    expect(r.map((o) => o.participant)).toEqual(["João Silva", "Maria"]);
    expect(r[0]!.items).toHaveLength(1);
  });
  it("filtro de categoria e 'sem categoria'", () => {
    expect(filterOrders(orders, { ...emptyFilters, category: "Prato principal" })).toHaveLength(2);
    expect(
      filterOrders(orders, { ...emptyFilters, category: NO_CATEGORY }).map((o) => o.participant),
    ).toEqual(["Zé Ângelo"]);
  });
});

describe("consolidação e indicadores", () => {
  it("agrupa itens por categoria na ordem configurada", () => {
    const g = groupByCategory(orders[0]!.items);
    expect(g.map((x) => x.category)).toEqual(["Prato principal", "Acompanhamentos"]);
    expect(g[1]!.items.map((i) => i.product)).toEqual(["Arroz", "Purê"]);
  });
  it("quantidade por categoria e por produto, com quem pediu", () => {
    const c = consolidate(orders);
    expect(c.map((x) => [x.category, x.quantity])).toEqual([
      ["Prato principal", 2],
      ["Acompanhamentos", 4],
      [null, 1],
    ]);
    const arroz = c[1]!.products.find((p) => p.product === "Arroz")!;
    expect(arroz.quantity).toBe(2);
    expect(arroz.people).toEqual(["João Silva", "Maria"]);
    expect(c[1]!.products[0]!.product).toBe("Arroz"); // mais pedido primeiro
  });
  it("totais: pedidos, itens, editados e valor só se houver preço", () => {
    expect(summarize(orders)).toEqual({
      orders: 3,
      items: 7,
      edited: 1,
      totalCents: 6000,
      paidCents: 0,
      pendingCents: 6000,
      paidOrders: 0,
    });
    expect(
      summarize([order("9", "X", [it_("a", "Arroz", "Acompanhamentos", 1)])]).totalCents,
    ).toBeNull();
  });
});

describe("reordenar", () => {
  it("move para cima e para baixo sem passar dos limites", () => {
    expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b"], "z", 1)).toEqual(["a", "b"]);
  });
});
