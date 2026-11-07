import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { consolidate } from "@/features/admin/orders-logic";
import { cartLinesForServer, type Step } from "@/features/order/logic";
import { ProductCard } from "@/features/order/ProductCard";
import { toText } from "@/lib/export";
import { cleanNote, NOTE_MAX } from "@/lib/order-note";
import type { MenuProduct } from "@/lib/catalog.functions";
import type { RoundOrder } from "@/lib/orders.functions";

describe("cleanNote", () => {
  it("apara, junta espaços e remove controles", () => {
    expect(cleanNote("  sem   cebola\n e\tmolho ")).toBe("sem cebola e molho");
    expect(cleanNote("a\u0000b")).toBe("a b");
  });
  it("vazio, só espaços, null e undefined viram null", () => {
    expect(cleanNote("")).toBeNull();
    expect(cleanNote("   \n ")).toBeNull();
    expect(cleanNote(null)).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
  });
  it("mantém acentos, emoji e aspas", () => {
    expect(cleanNote(`Pão "sem" glúten 🙂`)).toBe(`Pão "sem" glúten 🙂`);
  });
});

const product = (id: string, name: string) =>
  ({
    id,
    name,
    description: null,
    image_url: null,
    price_cents: null,
    category_id: "c1",
    is_active: true,
  }) as unknown as MenuProduct;

describe("envio das observações", () => {
  const frango = product("p1", "Frango");
  const arroz = product("p2", "Arroz");
  const steps = [
    {
      category: { id: "c1", name: "Prato", min_select: 1, max_select: 2 },
      products: [frango, arroz],
    },
  ] as unknown as Step[];

  it("manda a observação só dos itens no carrinho e limpa o texto", () => {
    const lines = cartLinesForServer({ p1: 1 }, steps, { p1: "  sem   cebola ", p2: "esquecida" });
    expect(lines).toEqual([{ product_id: "p1", quantity: 1, note: "sem cebola" }]);
  });
  it("observação vazia vai como null; sem notas continua funcionando", () => {
    expect(cartLinesForServer({ p1: 1, p2: 1 }, steps, { p1: "  " })).toEqual([
      { product_id: "p1", quantity: 1, note: null },
      { product_id: "p2", quantity: 1, note: null },
    ]);
    expect(cartLinesForServer({ p1: 1 }, steps)[0]?.note).toBeNull();
  });
});

describe("campo de observação no cartão", () => {
  function Harness({ selected }: { selected: boolean }) {
    const [note, setNote] = useState("");
    return (
      <ul>
        <ProductCard
          product={product("p1", "Frango")}
          quantity={selected ? 1 : 0}
          note={note}
          onNote={setNote}
          blocked={false}
          allowQuantity={false}
          index={0}
          onToggle={() => {}}
          onBlocked={() => {}}
          onQuantity={() => {}}
        />
      </ul>
    );
  }

  it("não aparece se o item não está escolhido", () => {
    render(<Harness selected={false} />);
    expect(screen.queryByText("Adicionar observação")).toBeNull();
  });
  it("abre o campo, aceita texto e respeita o limite", () => {
    render(<Harness selected />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar observação/ }));
    const input = screen.getByLabelText("Observação") as HTMLInputElement;
    expect(input.maxLength).toBe(NOTE_MAX);
    fireEvent.change(input, { target: { value: "sem cebola" } });
    expect(input.value).toBe("sem cebola");
  });
});

describe("painel e exportação", () => {
  const item = (id: string, product: string, note: string | null) => ({
    product_id: id,
    product,
    category: "Pratos",
    category_position: 0,
    price_cents: null,
    quantity: 1,
    note,
  });
  const order = (id: string, participant: string, note: string | null): RoundOrder => ({
    order_id: id,
    participant_id: `p-${id}`,
    participant,
    phone: null,
    created_at: "2026-11-06T12:00:00Z",
    updated_at: "2026-11-06T12:00:00Z",
    edited: false,
    paid_at: null,
    items: [item("f", "Frango", note)],
  });
  const orders = [order("1", "João", "sem cebola"), order("2", "Maria", null)];

  it("consolidado lista as observações com quem pediu", () => {
    const p = consolidate(orders)[0]!.products[0]!;
    expect(p.quantity).toBe(2);
    expect(p.notes).toEqual([{ text: "sem cebola", person: "João" }]);
  });
  it("texto do WhatsApp mostra a observação", () => {
    const t = toText("Almoço", orders);
    expect(t).toContain("1x Frango (obs.: sem cebola)");
    expect(t).toContain("1x Frango\n");
  });
});
