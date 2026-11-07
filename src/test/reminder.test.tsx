import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyName,
  countdownText,
  firstName,
  reminderTemplate,
  whatsappToLink,
} from "@/features/admin/reminder";
import { PendingCard } from "@/features/admin/PendingCard";

const getPending = vi.fn();
vi.mock("@/lib/orders.functions", () => ({
  getPendingParticipants: (a: unknown) => getPending(a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("lembrete: lógica", () => {
  it("monta o link do WhatsApp só para celular brasileiro válido", () => {
    const url = whatsappToLink("+5515999998888", "Oi, João!");
    expect(url).toBe("https://wa.me/5515999998888?text=Oi%2C%20Jo%C3%A3o!");
    expect(whatsappToLink("+551533334444", "x")).toBeNull();
    expect(whatsappToLink("abc", "x")).toBeNull();
  });
  it("usa o primeiro nome", () => {
    expect(firstName("  Maria  da Silva ")).toBe("Maria");
    expect(applyName("Oi, {nome}! {nome}", "Ana Paula")).toBe("Oi, Ana! Ana");
  });
  it("mensagem cita rodada, link e prazo", () => {
    const m = reminderTemplate({
      roundName: "Almoço",
      link: "https://x.com.br",
      closesAt: "2026-11-07T14:30:00Z",
    });
    expect(m).toContain("*Almoço*");
    expect(m).toContain("https://x.com.br");
    expect(m).toContain("Pedidos até");
    expect(reminderTemplate({ roundName: "A", link: "l", closesAt: null })).not.toContain("⏰");
  });
  it("contagem regressiva", () => {
    const now = Date.parse("2026-11-07T10:00:00Z");
    const at = (ms: number) => new Date(now + ms).toISOString();
    expect(countdownText(null, now)).toBeNull();
    expect(countdownText(at(-1000), now)).toBeNull();
    expect(countdownText(at(30_000), now)).toBe("menos de 1 min");
    expect(countdownText(at(35 * 60_000), now)).toBe("35 min");
    expect(countdownText(at(80 * 60_000), now)).toBe("1 h 20 min");
    expect(countdownText(at(120 * 60_000), now)).toBe("2 h");
    expect(countdownText(at(26 * 3600_000), now)).toBe("1 d 2 h");
  });
});

const round = { id: "r1", name: "Almoço", state: "open", closes_at: null };
const wrap = (r = round) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PendingCard round={r} />
    </QueryClientProvider>,
  );

describe("PendingCard", () => {
  beforeEach(() => {
    getPending.mockReset();
    vi.stubGlobal("open", vi.fn());
  });

  it("lista quem não pediu e abre o WhatsApp com o primeiro nome", async () => {
    getPending.mockResolvedValue({
      now: new Date().toISOString(),
      people: [
        { id: "p1", name: "João Pereira", phone: "(15) 99999-8888", phoneE164: "+5515999998888" },
        { id: "p2", name: "Ana", phone: "(15) 98888-7777", phoneE164: "+5515988887777" },
      ],
    });
    wrap();
    expect(await screen.findByText("Quem ainda não pediu (2)")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /^Lembrar$/ })[0]!);
    const url = (window.open as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain("https://wa.me/5515999998888?text=");
    expect(decodeURIComponent(url)).toContain("Oi, João!");
    expect(await screen.findByText("Lembrado")).toBeInTheDocument();
  });

  it("não aparece com a rodada encerrada e não consulta o servidor", async () => {
    const { container } = wrap({ ...round, state: "closed" });
    await new Promise((r) => setTimeout(r, 20));
    expect(getPending).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("some quando não há ninguém e não há prazo", async () => {
    getPending.mockResolvedValue({ now: new Date().toISOString(), people: [] });
    const { container } = wrap();
    await waitFor(() => expect(getPending).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
