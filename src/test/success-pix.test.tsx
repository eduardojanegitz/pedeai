import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UPDATE_AUTO_CLOSE_MS } from "@/features/order/successTimeline";
import type { MyPayment } from "@/lib/orders.functions";

const getMyPayment = vi.fn(async (_: unknown): Promise<MyPayment> => ({
  state: "unavailable",
  reason: "no_pix",
}));
const copy = vi.fn(async (_: string) => {});
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/orders.functions", () => ({ getMyPayment: (a: unknown) => getMyPayment(a) }));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (t: string) => copy(t) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { OrderSuccess } from "@/features/order/OrderSuccess";

const T = "t".repeat(40);
const due: MyPayment = {
  state: "pay",
  totalCents: 5700,
  payload: "00020126PAYLOAD6304ABCD",
  receiver: "MARIA APARECIDA",
  keyMasked: "529***725",
};

function setup(variant: "created" | "updated", onView = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <OrderSuccess
        variant={variant}
        items={[{ name: "Frango", quantity: 1 }]}
        onView={onView}
        token={T}
        roundId="r1"
        reduceMotion
      />
    </QueryClientProvider>,
  );
  return { onView };
}

describe("Pix na mensagem de confirmação", () => {
  beforeEach(() => {
    getMyPayment.mockReset();
    copy.mockClear();
  });

  it("mostra o valor, o QR e o botão de copiar junto com a confirmação", async () => {
    getMyPayment.mockResolvedValue(due);
    setup("created");
    expect(screen.getAllByText("Seu pedido foi confirmado!").length).toBeGreaterThan(0);
    expect(await screen.findByText(/Último passo: pagar por Pix/)).toBeTruthy();
    expect(screen.getByText(/o pagamento ainda não foi feito/)).toBeTruthy();
    expect(screen.getByText("R$ 57,00")).toBeTruthy();
    expect(screen.getByRole("img", { name: /QR Code Pix de R\$\s57,00/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Copiar código Pix/ }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith("00020126PAYLOAD6304ABCD"));
    // as ações da confirmação continuam disponíveis
    expect(screen.getByRole("button", { name: "Ver meu pedido" })).toBeTruthy();
  });

  it("sem Pix configurado (ou sem preço), a confirmação fica como antes", async () => {
    getMyPayment.mockResolvedValue({ state: "unavailable", reason: "no_pix" });
    setup("created");
    await waitFor(() => expect(getMyPayment).toHaveBeenCalled());
    expect(screen.queryByText(/Último passo/)).toBeNull();
    expect(screen.getByRole("button", { name: "Ver meu pedido" })).toBeTruthy();
  });

  it("já pago: mostra a confirmação do pagamento em vez do QR", async () => {
    getMyPayment.mockResolvedValue({
      state: "paid",
      totalCents: 5700,
      paidAt: "2026-11-06T15:00:00Z",
      changedAfter: false,
    });
    setup("created");
    expect(await screen.findByText("Pagamento confirmado")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Copiar código Pix/ })).toBeNull();
  });

  it("não busca nada quando não recebe token (comportamento anterior)", () => {
    render(<OrderSuccess variant="created" items={[]} onView={() => {}} reduceMotion />);
    expect(getMyPayment).not.toHaveBeenCalled();
  });
});

describe("fechamento automático da atualização", () => {
  beforeEach(() => {
    getMyPayment.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("com Pix a pagar, NÃO fecha sozinha (para dar tempo de ver e pagar)", async () => {
    getMyPayment.mockResolvedValue(due);
    const { onView } = setup("updated");
    await screen.findByText(/Último passo: pagar por Pix/);
    await act(async () => {
      vi.advanceTimersByTime(UPDATE_AUTO_CLOSE_MS * 3);
    });
    expect(onView).not.toHaveBeenCalled();
  });

  it("sem nada a pagar, fecha sozinha como antes", async () => {
    getMyPayment.mockResolvedValue({ state: "unavailable", reason: "no_pix" });
    const { onView } = setup("updated");
    await waitFor(() => expect(getMyPayment).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100); // deixa a consulta terminar e o temporizador nascer
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_AUTO_CLOSE_MS + 500);
    });
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("se a consulta de pagamento falhar, não prende o participante: fecha sozinha", async () => {
    getMyPayment.mockRejectedValue(new Error("rede"));
    const { onView } = setup("updated");
    await waitFor(() => expect(getMyPayment).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100); // deixa a consulta terminar e o temporizador nascer
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_AUTO_CLOSE_MS + 500);
    });
    expect(onView).toHaveBeenCalledTimes(1);
  });
});
