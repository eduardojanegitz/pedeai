import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyFilters, filterOrders, orderValue, summarize } from "@/features/admin/orders-logic";
import type { MyPayment, RoundOrder } from "@/lib/orders.functions";

const getMyPayment = vi.fn(async (_: unknown): Promise<MyPayment> => ({
  state: "unavailable",
  reason: "no_pix",
}));
const savePix = vi.fn(async (_: unknown) => ({
  ok: true,
  key: "52998224725",
  name: "MARIA",
  city: "SOROCABA",
}));
const clearPix = vi.fn(async () => ({ ok: true }));
const copy = vi.fn(async (_: string) => {});

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/orders.functions", () => ({ getMyPayment: (a: unknown) => getMyPayment(a) }));
vi.mock("@/lib/pix.functions", () => ({
  savePixSettings: (a: unknown) => savePix(a),
  clearPixSettings: () => clearPix(),
}));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (t: string) => copy(t) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { PixSettingsForm } from "@/features/admin/PixSettings";
import { PixPayment } from "@/features/order/PixPayment";

const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

describe("PixPayment (participante)", () => {
  beforeEach(() => {
    getMyPayment.mockReset();
    copy.mockClear();
  });

  it("mostra valor, recebedor, QR e copia o código", async () => {
    getMyPayment.mockResolvedValue({
      state: "pay",
      totalCents: 5700,
      payload: "00020126PAYLOAD6304ABCD",
      receiver: "MARIA APARECIDA",
      keyMasked: "529***725",
    });
    wrap(<PixPayment token={"t".repeat(40)} roundId="r1" />);
    expect(await screen.findByText("R$ 57,00")).toBeTruthy();
    expect(screen.getByText("MARIA APARECIDA")).toBeTruthy();
    expect(screen.getByText(/529\*\*\*725/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /QR Code Pix de R\$\s57,00/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Copiar código Pix/ }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith("00020126PAYLOAD6304ABCD"));
    // a chave inteira nunca aparece na tela
    expect(document.body.textContent).not.toContain("52998224725");
  });

  it("pago: confirma e avisa se o pedido mudou depois", async () => {
    getMyPayment.mockResolvedValue({
      state: "paid",
      totalCents: 5700,
      paidAt: "2026-11-06T15:00:00Z",
      changedAfter: true,
    });
    wrap(<PixPayment token={"t".repeat(40)} roundId="r1" />);
    expect(await screen.findByText("Pagamento confirmado")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("mudou depois do pagamento");
    expect(screen.queryByRole("button", { name: /Copiar código Pix/ })).toBeNull();
  });

  it("pago sem mudança não mostra aviso", async () => {
    getMyPayment.mockResolvedValue({
      state: "paid",
      totalCents: 5700,
      paidAt: "2026-11-06T15:00:00Z",
      changedAfter: false,
    });
    wrap(<PixPayment token={"t".repeat(40)} roundId="r1" />);
    await screen.findByText("Pagamento confirmado");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sem Pix, sem preço ou sem pedido: não mostra nada", async () => {
    for (const reason of ["no_pix", "no_prices", "no_order"] as const) {
      getMyPayment.mockResolvedValue({ state: "unavailable", reason });
      const { container, unmount } = wrap(<PixPayment token={"t".repeat(40)} roundId="r1" />);
      await waitFor(() => expect(getMyPayment).toHaveBeenCalled());
      expect(container.textContent).toBe("");
      unmount();
    }
  });
});

describe("formulário do Pix (admin)", () => {
  const settings = { type: "cpf" as const, key: "52998224725", name: "MARIA", city: "SOROCABA" };
  beforeEach(() => {
    savePix.mockClear();
    clearPix.mockClear();
  });

  const fill = (key: string, name = "Maria Aparecida", city = "Sorocaba") => {
    fireEvent.change(screen.getByLabelText("Chave Pix"), { target: { value: key } });
    fireEvent.change(screen.getByLabelText("Nome do recebedor"), { target: { value: name } });
    fireEvent.change(screen.getByLabelText("Cidade do recebedor"), { target: { value: city } });
  };

  it("valida a chave e os campos antes de enviar", async () => {
    wrap(<PixSettingsForm settings={null} audit={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar Pix" }));
    expect((await screen.findAllByRole("alert")).length).toBe(3);
    fill("111.111.111-11");
    fireEvent.click(screen.getByRole("button", { name: "Salvar Pix" }));
    expect(await screen.findByText("CPF inválido.")).toBeTruthy();
    expect(savePix).not.toHaveBeenCalled();
  });

  it("primeira configuração salva direto, sem pedir confirmação", async () => {
    wrap(<PixSettingsForm settings={null} audit={[]} />);
    fill("529.982.247-25");
    fireEvent.click(screen.getByRole("button", { name: "Salvar Pix" }));
    await waitFor(() =>
      expect(savePix).toHaveBeenCalledWith({
        data: { type: "cpf", key: "529.982.247-25", name: "Maria Aparecida", city: "Sorocaba" },
      }),
    );
  });

  it("trocar uma chave que já existe pede confirmação e só salva se confirmar", async () => {
    wrap(<PixSettingsForm settings={settings} audit={[]} />);
    fireEvent.change(screen.getByLabelText("Tipo da chave"), { target: { value: "email" } });
    fill("outro@exemplo.com.br", "MARIA", "SOROCABA");
    fireEvent.click(screen.getByRole("button", { name: "Salvar Pix" }));
    expect(await screen.findByText("Trocar a chave Pix?")).toBeTruthy();
    expect(savePix).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Trocar chave" }));
    await waitFor(() => expect(savePix).toHaveBeenCalledTimes(1));
  });

  it("mudar só o nome da mesma chave salva sem confirmação", async () => {
    wrap(<PixSettingsForm settings={settings} audit={[]} />);
    fireEvent.change(screen.getByLabelText("Nome do recebedor"), { target: { value: "MARIA A" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar Pix" }));
    await waitFor(() => expect(savePix).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Trocar a chave Pix?")).toBeNull();
  });

  it("mostra a chave mascarada, o teste de R$ 1,00 e as trocas anteriores", async () => {
    wrap(
      <PixSettingsForm
        settings={settings}
        audit={[{ changedAt: "2026-11-05T12:00:00Z", oldKey: "111***111", newKey: "529***725" }]}
      />,
    );
    expect(screen.getByText(/Pix ativo: CPF 529\*\*\*725/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Testar com R\$ 1,00/ }));
    expect(screen.getByRole("img", { name: /QR Code Pix de teste de R\$ 1,00/ })).toBeTruthy();
    expect(screen.getByText(/111\*\*\*111 → 529\*\*\*725/)).toBeTruthy();
  });

  it("remover pede confirmação", async () => {
    wrap(<PixSettingsForm settings={settings} audit={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Remover Pix/ }));
    expect(clearPix).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Remover" }));
    await waitFor(() => expect(clearPix).toHaveBeenCalledTimes(1));
  });
});

describe("valores e pagamentos no painel", () => {
  const item = (price: number | null, qty = 1) => ({
    product_id: `p${price}${qty}`,
    product: "X",
    category: "C",
    category_position: 0,
    price_cents: price,
    quantity: qty,
    note: null,
  });
  const order = (
    id: string,
    items: RoundOrder["items"],
    paid: string | null = null,
  ): RoundOrder => ({
    order_id: id,
    participant_id: `p-${id}`,
    participant: id.toUpperCase(),
    phone: null,
    created_at: "2026-11-06T12:00:00Z",
    updated_at: "2026-11-06T12:00:00Z",
    edited: false,
    paid_at: paid,
    items,
  });
  const orders = [
    order("a", [item(2800), item(0)], "2026-11-06T13:00:00Z"),
    order("b", [item(3200), item(500, 2)]),
    order("c", [item(null)]),
  ];

  it("valor do pedido: soma preço x quantidade; itens sem preço não contam", () => {
    expect(orderValue(orders[0]!)).toBe(2800);
    expect(orderValue(orders[1]!)).toBe(4200);
    expect(orderValue(orders[2]!)).toBeNull();
  });

  it("recebido e a receber", () => {
    const s = summarize(orders);
    expect(s.totalCents).toBe(7000);
    expect(s.paidCents).toBe(2800);
    expect(s.pendingCents).toBe(4200);
    expect(s.paidOrders).toBe(1);
  });

  it("sem preços, nada de valores", () => {
    const s = summarize([order("z", [item(null)])]);
    expect(s.totalCents).toBeNull();
    expect(s.paidCents).toBeNull();
    expect(s.pendingCents).toBeNull();
  });

  it("filtro de pagamento", () => {
    expect(
      filterOrders(orders, { ...emptyFilters, payment: "paid" }).map((o) => o.order_id),
    ).toEqual(["a"]);
    expect(
      filterOrders(orders, { ...emptyFilters, payment: "pending" }).map((o) => o.order_id),
    ).toEqual(["b", "c"]);
    expect(filterOrders(orders, emptyFilters)).toHaveLength(3);
  });
});
