/** Item de um pedido anterior, como o participante vê. */
export type LastOrderItem = {
  product_id: string;
  quantity: number;
  note: string | null;
  product_name: string | null;
};

/** O último pedido confirmado do participante em uma rodada anterior ("o de sempre"). */
export type LastOrder = {
  /** Quando foi feito/editado pela última vez (ISO). */
  when: string;
  roundName: string;
  items: LastOrderItem[];
};

type Row = {
  updated_at: string;
  rounds: { name: string } | null;
  order_items: {
    product_id: string;
    quantity: number;
    note: string | null;
    products: { name: string } | null;
  }[];
};

/** Escolhe o pedido mais recente (com itens) entre as linhas lidas do banco. */
export function pickLastOrder(rows: Row[]): LastOrder | null {
  const best = [...rows]
    .filter((r) => r.order_items.length > 0)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
  if (!best) return null;
  return {
    when: best.updated_at,
    roundName: best.rounds?.name ?? "Rodada anterior",
    items: best.order_items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      note: i.note ?? null,
      product_name: i.products?.name ?? null,
    })),
  };
}
