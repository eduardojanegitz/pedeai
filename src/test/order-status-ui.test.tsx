import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyStatus } from "@/lib/orders.functions";
import { OrderStatus } from "@/features/order/OrderStatus";

const getMyStatus = vi.fn(async (_: unknown): Promise<MyStatus> => ({ state: "none" }));
vi.mock("@/lib/orders.functions", () => ({ getMyStatus: (a: unknown) => getMyStatus(a) }));
vi.mock("@/lib/push.functions", () => ({
  getPushConfig: async () => ({ publicKey: null }),
  savePushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TOKEN = "t".repeat(40);
const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrderStatus token={TOKEN} roundId="r1" />
    </QueryClientProvider>,
  );

describe("OrderStatus", () => {
  beforeEach(() => getMyStatus.mockReset());

  it("não mostra nada sem pedido confirmado", async () => {
    getMyStatus.mockResolvedValue({ state: "none" });
    const { container } = wrap();
    await waitFor(() => expect(getMyStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("recebido: marca a etapa atual", async () => {
    getMyStatus.mockResolvedValue({ state: "received", doneAt: null, roundName: "Almoço" });
    wrap();
    expect(await screen.findByText("Status do pedido")).toBeInTheDocument();
    expect(screen.getByText("Recebido").closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("em preparo", async () => {
    getMyStatus.mockResolvedValue({ state: "preparing", doneAt: null, roundName: "Almoço" });
    wrap();
    await screen.findByText("Status do pedido");
    expect(screen.getByText("Em preparo").closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("pronto: destaca o título e muda o título da aba", async () => {
    getMyStatus.mockResolvedValue({
      state: "ready",
      doneAt: "2026-11-07T12:00:00Z",
      roundName: "Almoço",
    });
    wrap();
    expect(await screen.findByText("Seu pedido está pronto!")).toBeInTheDocument();
    expect(screen.getByText("Pronto").closest("li")).toHaveAttribute("aria-current", "step");
    expect(document.title).toContain("Pedido pronto");
  });
});
