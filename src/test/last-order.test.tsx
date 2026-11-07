import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSteps, prefillFromLast } from "@/features/order/logic";
import { pickLastOrder, type LastOrder } from "@/lib/last-order";

const getLastOrder = vi.fn(async (_: unknown): Promise<LastOrder | null> => null);
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/orders.functions", () => ({
  submitOrder: vi.fn(),
  getMyOrder: vi.fn(),
  getLastOrder: (arg: unknown) => getLastOrder(arg),
}));
vi.mock("@/lib/identity.functions", () => ({
  identifyParticipant: vi.fn(),
  recoverParticipant: vi.fn(),
  attachPhone: vi.fn(),
  rotateRecoveryCode: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { OrderFlow } from "@/features/order/OrderFlow";

const cat = (id: string, name: string, pos: number, min: number, max: number, qty = false) =>
  ({
    id,
    name,
    description: null,
    position: pos,
    min_select: min,
    max_select: max,
    allow_quantity: qty,
    is_active: true,
  }) as never;
const prod = (id: string, name: string, category_id: string, active = true) =>
  ({
    id,
    name,
    description: null,
    image_url: null,
    price_cents: null,
    category_id,
    is_active: active,
  }) as never;

const categories = [cat("c1", "Prato principal", 0, 1, 1), cat("c2", "Acompanhamentos", 1, 2, 2)];
const products = [
  prod("frango", "Frango", "c1"),
  prod("lasanha", "Lasanha", "c1"),
  prod("arroz", "Arroz", "c2"),
  prod("pure", "Purê", "c2"),
  prod("farofa", "Farofa", "c2"),
];
const steps = buildSteps(categories as never, products as never);

const item = (id: string, name: string | null, quantity = 1, note: string | null = null) => ({
  product_id: id,
  quantity,
  note,
  product_name: name,
});

describe("prefillFromLast", () => {
  it("repete o pedido anterior quando tudo continua disponível", () => {
    const r = prefillFromLast(steps, [
      item("frango", "Frango", 1, "sem cebola"),
      item("arroz", "Arroz"),
      item("pure", "Purê"),
    ]);
    expect(r.cart).toEqual({ frango: 1, arroz: 1, pure: 1 });
    expect(r.notes).toEqual({ frango: "sem cebola" });
    expect(r.skipped).toEqual([]);
  });

  it("deixa de fora e avisa o que saiu do cardápio", () => {
    const r = prefillFromLast(steps, [
      item("frango", "Frango"),
      item("arroz", "Arroz"),
      item("sumiu", "Bife acebolado"),
      item("outro", null),
    ]);
    expect(r.cart).toEqual({ frango: 1, arroz: 1 });
    expect(r.skipped).toEqual(["Bife acebolado", "Item removido"]);
  });

  it("produto desativado também fica de fora", () => {
    const off = buildSteps(
      categories as never,
      [
        ...products.filter((p) => (p as { id: string }).id !== "pure"),
        prod("pure", "Purê", "c2", false),
      ] as never,
    );
    const r = prefillFromLast(off, [
      item("frango", "Frango"),
      item("arroz", "Arroz"),
      item("pure", "Purê"),
    ]);
    expect(r.cart).toEqual({ frango: 1, arroz: 1 });
    expect(r.skipped).toEqual(["Purê"]);
  });

  it("limite menor hoje: mantém as primeiras opções e avisa as demais", () => {
    const tight = buildSteps(
      [cat("c1", "Prato principal", 0, 1, 1), cat("c2", "Acompanhamentos", 1, 1, 1)] as never,
      products as never,
    );
    const r = prefillFromLast(tight, [
      item("frango", "Frango"),
      item("arroz", "Arroz"),
      item("pure", "Purê"),
    ]);
    expect(r.cart).toEqual({ frango: 1, arroz: 1 });
    expect(r.skipped).toEqual(["Purê"]);
  });

  it("quantidade só se a categoria permite hoje", () => {
    const qty = buildSteps(
      [cat("c1", "Prato principal", 0, 1, 2, true)] as never,
      products as never,
    );
    expect(prefillFromLast(qty, [item("frango", "Frango", 3)]).cart).toEqual({ frango: 3 });
    expect(prefillFromLast(steps, [item("frango", "Frango", 3)]).cart).toEqual({ frango: 1 });
    expect(prefillFromLast(qty, [item("frango", "Frango", 500)]).cart).toEqual({ frango: 99 });
  });

  it("observação é limpa; vazia some", () => {
    const r = prefillFromLast(steps, [
      item("frango", "Frango", 1, "  pouco   sal "),
      item("arroz", "Arroz", 1, "  "),
    ]);
    expect(r.notes).toEqual({ frango: "pouco sal" });
  });

  it("pedido anterior sem nada disponível dá carrinho vazio", () => {
    const r = prefillFromLast(steps, [item("x", "Antigo")]);
    expect(r.cart).toEqual({});
    expect(r.skipped).toEqual(["Antigo"]);
  });
});

describe("pickLastOrder", () => {
  const row = (updated_at: string, ids: string[], round = "Almoço") => ({
    updated_at,
    rounds: { name: round },
    order_items: ids.map((id) => ({
      product_id: id,
      quantity: 1,
      note: id === "frango" ? "sem cebola" : null,
      products: { name: id.toUpperCase() },
    })),
  });

  it("pega o mais recente e traduz os itens", () => {
    const r = pickLastOrder([
      row("2026-11-01T12:00:00Z", ["lasanha"], "Antigo"),
      row("2026-11-04T12:00:00Z", ["frango", "arroz"], "Quarta"),
    ])!;
    expect(r.roundName).toBe("Quarta");
    expect(r.when).toBe("2026-11-04T12:00:00Z");
    expect(r.items.map((i) => i.product_name)).toEqual(["FRANGO", "ARROZ"]);
    expect(r.items[0]?.note).toBe("sem cebola");
  });
  it("ignora pedido sem itens; sem histórico devolve null", () => {
    expect(pickLastOrder([row("2026-11-04T12:00:00Z", [])])).toBeNull();
    expect(pickLastOrder([])).toBeNull();
    const r = pickLastOrder([
      row("2026-11-04T12:00:00Z", []),
      row("2026-11-01T12:00:00Z", ["frango"]),
    ]);
    expect(r?.items).toHaveLength(1);
  });
});

describe("faixa 'Pedir o de sempre'", () => {
  const last: LastOrder = {
    when: "2026-11-04T15:00:00Z",
    roundName: "Almoço de quarta",
    items: [
      item("frango", "Frango"),
      item("arroz", "Arroz"),
      item("pure", "Purê"),
      item("sumiu", "Bife"),
    ],
  };
  const setup = (existing = false) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <OrderFlow
          round={{ id: "r1", name: "Almoço", closes_at: null } as never}
          token={"t".repeat(40)}
          me={
            {
              participant: { id: "p1", display_name: "Eduardo" },
              items: [],
              version: 0,
              has_phone: true,
              status: null,
            } as never
          }
          menu={{ categories, products } as never}
          existing={existing}
          onSaved={() => {}}
          onExit={() => {}}
        />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    getLastOrder.mockReset();
    localStorage.clear();
  });

  it("aparece com o resumo do último pedido; um toque leva à revisão já montada", async () => {
    getLastOrder.mockResolvedValue(last);
    setup();
    const banner = await screen.findByRole("region", { name: "Pedir o de sempre" });
    expect(banner.textContent).toContain("Frango · Arroz · Purê · Bife");
    fireEvent.click(screen.getByRole("button", { name: "Usar este pedido" }));
    expect(await screen.findByText(/Montamos este pedido a partir do seu pedido de/)).toBeTruthy();
    expect(screen.getByText("Seu pedido")).toBeTruthy();
    // o que saiu do cardápio é avisado
    expect(screen.getByRole("alert").textContent).toContain("Bife");
    // itens aproveitados aparecem na revisão
    expect(screen.getByText("Frango")).toBeTruthy();
    expect(screen.getByText("Arroz")).toBeTruthy();
  });

  it("não aparece sem histórico", async () => {
    getLastOrder.mockResolvedValue(null);
    setup();
    await waitFor(() => expect(getLastOrder).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Pedir o de sempre" })).toBeNull();
  });

  it("não aparece (nem consulta) quando o participante está editando um pedido", async () => {
    getLastOrder.mockResolvedValue(last);
    setup(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(getLastOrder).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Pedir o de sempre" })).toBeNull();
  });

  it("some depois que o participante já escolheu algo", async () => {
    getLastOrder.mockResolvedValue(last);
    setup();
    await screen.findByRole("region", { name: "Pedir o de sempre" });
    fireEvent.click(screen.getByRole("button", { name: /Frango/ }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Pedir o de sempre" })).toBeNull(),
    );
  });

  it("se nada do pedido antigo está disponível, avisa e continua no cardápio", async () => {
    getLastOrder.mockResolvedValue({ ...last, items: [item("sumiu", "Bife")] });
    setup();
    await screen.findByRole("region", { name: "Pedir o de sempre" });
    fireEvent.click(screen.getByRole("button", { name: "Usar este pedido" }));
    await waitFor(() => expect(screen.queryByText("Seu pedido")).toBeNull());
    expect(screen.getByRole("region", { name: "Pedir o de sempre" })).toBeTruthy();
  });
});
