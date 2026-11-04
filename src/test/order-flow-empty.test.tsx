import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/orders.functions", () => ({
  submitOrder: vi.fn(),
  getMyOrder: vi.fn(),
}));
vi.mock("@/lib/identity.functions", () => ({
  identifyParticipant: vi.fn(),
  recoverParticipant: vi.fn(),
  attachPhone: vi.fn(),
  rotateRecoveryCode: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { OrderFlow } from "@/features/order/OrderFlow";

describe("OrderFlow sem itens no cardápio", () => {
  it("mostra 'Cardápio em preparação' em vez de quebrar", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <OrderFlow
          round={{ id: "r1", name: "Almoço" } as never}
          token="t"
          me={
            {
              participant: { id: "p1", name: "Eduardo" },
              items: [],
              version: 0,
              has_phone: true,
            } as never
          }
          menu={{ categories: [], products: [] } as never}
          existing={false}
          onSaved={() => {}}
          onExit={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Cardápio em preparação")).toBeTruthy();
  });
});
