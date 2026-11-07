import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  changedSincePrint,
  defaultPrintOptions,
  ordersToPrint,
  orderTotal,
  pageCss,
  PAPERS,
  rollHeightMm,
  snapshotInstant,
} from "@/features/admin/comanda";
import { ComandaSheet } from "@/features/admin/ComandaSheet";
import type { AdminRound, RoundOrder } from "@/lib/orders.functions";

const markRoundPrinted = vi.fn(async (_: unknown) => ({ ok: true }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/orders.functions", () => ({
  markRoundPrinted: (arg: unknown) => markRoundPrinted(arg),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { PrintDialog } from "@/features/admin/PrintDialog";

const item = (
  id: string,
  product: string,
  category: string | null,
  pos: number,
  note: string | null = null,
  price: number | null = null,
  quantity = 1,
) => ({
  product_id: id,
  product,
  category,
  category_position: pos,
  price_cents: price,
  quantity,
  note,
});
const order = (
  id: string,
  name: string,
  items: RoundOrder["items"],
  created = "2026-11-06T12:00:00Z",
  updated = created,
  phone: string | null = null,
): RoundOrder => ({
  order_id: id,
  participant_id: `p-${id}`,
  participant: name,
  phone,
  created_at: created,
  updated_at: updated,
  edited: updated !== created,
  paid_at: null,
  items,
});

const orders: RoundOrder[] = [
  order(
    "1",
    "João",
    [item("f", "Frango", "Prato", 0, "sem cebola", 2800), item("a", "Arroz", "Acomp.", 1, null, 0)],
    "2026-11-06T12:00:00Z",
    "2026-11-06T12:00:00Z",
    "(15) 99999-1111",
  ),
  order(
    "2",
    "Maria",
    [item("f", "Frango", "Prato", 0, null, 2800), item("a", "Arroz", "Acomp.", 1)],
    "2026-11-06T12:05:00Z",
    "2026-11-06T12:20:00Z",
  ),
  order("3", "Zé", [item("l", "Lasanha", "Prato", 0)], "2026-11-06T12:30:00Z"),
];

describe("lógica da comanda", () => {
  it("instante dos dados = o mais recente entre criação e edição", () => {
    expect(snapshotInstant(orders)).toBe("2026-11-06T12:30:00.000Z");
    expect(snapshotInstant([])).toBeNull();
  });

  it("sem impressão anterior, nada é marcado como alterado", () => {
    expect(changedSincePrint(orders, null).size).toBe(0);
  });

  it("marca novos e editados depois da última impressão", () => {
    const changed = changedSincePrint(orders, "2026-11-06T12:10:00Z");
    expect(changed.get("2")).toBe("edited"); // criado antes, editado depois
    expect(changed.get("3")).toBe("new"); // criado depois
    expect(changed.has("1")).toBe(false);
  });

  it("'só alterados' só vale na comanda por pessoa", () => {
    const changed = changedSincePrint(orders, "2026-11-06T12:10:00Z");
    const people = ordersToPrint(
      orders,
      { ...defaultPrintOptions, mode: "people", onlyChanged: true },
      changed,
    );
    expect(people.map((o) => o.participant)).toEqual(["Maria", "Zé"]);
    const kitchen = ordersToPrint(
      orders,
      { ...defaultPrintOptions, mode: "kitchen", onlyChanged: true },
      changed,
    );
    expect(kitchen).toHaveLength(3);
  });

  it("total do pedido: null sem preço", () => {
    expect(orderTotal(orders[0]!)).toBe(2800);
    expect(orderTotal(orders[2]!)).toBeNull();
  });

  it("papéis: bobinas levam largura e altura explícitas (o Chrome ignora 'auto')", () => {
    expect(pageCss("80mm", 120)).toBe("@page { size: 80mm 120mm; margin: 0; }");
    expect(pageCss("58mm", null)).toContain("size: 58mm 297mm");
    expect(pageCss("a4", 120)).toContain("size: A4");
    expect(pageCss("80mm", 120)).not.toContain("auto");
    expect(PAPERS.a4.pageWidthMm).toBeNull();
  });
});

const sheet = (over: Partial<React.ComponentProps<typeof ComandaSheet>> = {}) =>
  render(
    <ComandaSheet
      roundName="Almoço"
      generatedAt="2026-11-06T15:00:00Z"
      orders={orders}
      mode="kitchen"
      paper="80mm"
      showPhone={false}
      showPrices={false}
      changed={new Map()}
      lastPrintedAt={null}
      {...over}
    />,
  );

describe("folha da comanda", () => {
  it("consolidada: totais por categoria e produto, com observações e quem pediu", () => {
    sheet();
    expect(screen.getByRole("heading", { name: "Almoço" })).toBeTruthy();
    const prato = screen.getByRole("region", { name: "Prato" });
    expect(within(prato).getByText("2x")).toBeTruthy(); // 2 frangos
    expect(within(prato).getByText("Frango")).toBeTruthy();
    expect(within(prato).getByText(/sem cebola \(João\)/)).toBeTruthy();
    expect(screen.getByText(/3 pedidos/)).toBeTruthy();
  });

  it("não mostra celular nem valores por padrão", () => {
    sheet({ mode: "people" });
    expect(screen.queryByText(/99999/)).toBeNull();
    expect(screen.queryByText(/R\$/)).toBeNull();
  });

  it("por pessoa: um ticket por participante, com celular e valores quando pedidos", () => {
    sheet({ mode: "people", showPhone: true, showPrices: true });
    expect(screen.getAllByRole("article")).toHaveLength(3);
    const joao = screen.getByRole("article", { name: "João" });
    expect(within(joao).getByText(/\(15\) 99999-1111/)).toBeTruthy();
    expect(within(joao).getByText(/sem cebola/)).toBeTruthy();
    expect(within(joao).getAllByText(/R\$/).length).toBeGreaterThan(0);
    expect(within(joao).getByText(/Pedido 1 de 3/)).toBeTruthy();
  });

  it("avisa na folha o que mudou desde a última impressão", () => {
    const changed = changedSincePrint(orders, "2026-11-06T12:10:00Z");
    sheet({ changed, lastPrintedAt: "2026-11-06T12:10:00Z" });
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("Maria (editado)");
    expect(note.textContent).toContain("Zé (novo)");
    sheet({ mode: "people", changed });
    expect(screen.getByText(/Alterado após a última impressão/)).toBeTruthy();
    expect(screen.getByText(/Pedido novo após a última impressão/)).toBeTruthy();
  });

  it("marca o papel para o CSS de impressão", () => {
    const { container } = sheet({ paper: "58mm" });
    expect(container.querySelector(".comanda")?.getAttribute("data-paper")).toBe("58mm");
  });
});

const round = (last: string | null): AdminRound =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Almoço",
    status: "open",
    opened_at: "2026-11-06T10:00:00Z",
    closed_at: null,
    opens_at: null,
    closes_at: null,
    state: "open",
    last_printed_at: last,
  }) as AdminRound;

function openDialog(last: string | null, preset?: Parameters<typeof PrintDialog>[0]["preset"]) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PrintDialog
        open
        onOpenChange={onOpenChange}
        round={round(last)}
        orders={orders}
        preset={preset}
      />
    </QueryClientProvider>,
  );
  return { invalidate, onOpenChange };
}

describe("diálogo de impressão", () => {
  beforeEach(() => {
    markRoundPrinted.mockClear();
    localStorage.clear();
    window.print = vi.fn();
  });

  it("imprime, pergunta se saiu certo e registra com o instante dos dados", async () => {
    const { invalidate, onOpenChange } = openDialog(null);
    fireEvent.click(screen.getByRole("button", { name: /^Imprimir$/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event("afterprint")));
    expect(await screen.findByText("A comanda saiu certa na impressora?")).toBeTruthy();
    expect(markRoundPrinted).not.toHaveBeenCalled(); // cancelar a impressão não registra
    fireEvent.click(screen.getByRole("button", { name: "Sim, registrar impressão" }));
    await waitFor(() =>
      expect(markRoundPrinted).toHaveBeenCalledWith({
        data: {
          roundId: "11111111-1111-4111-8111-111111111111",
          printedAt: "2026-11-06T12:30:00.000Z",
        },
      }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["rounds"] }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("'Não' volta sem registrar nada", async () => {
    openDialog(null);
    fireEvent.click(screen.getByRole("button", { name: /^Imprimir$/ }));
    act(() => window.dispatchEvent(new Event("afterprint")));
    fireEvent.click(await screen.findByRole("button", { name: "Não, voltar" }));
    expect(markRoundPrinted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Imprimir$/ })).toBeTruthy();
  });

  it("papel escolhido vira regra @page da impressão e é lembrado", () => {
    openDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Térmica 58 mm" }));
    expect(document.querySelector(".comanda-print-root style")?.textContent).toContain(
      "size: 58mm 297mm",
    );
    expect(JSON.parse(localStorage.getItem("pedeai:print-options")!).paper).toBe("58mm");
  });

  it("a folha de impressão existe no documento só com o diálogo aberto", () => {
    openDialog(null);
    expect(document.querySelector(".comanda-print-root .comanda")).toBeTruthy();
  });

  it("atalho 'só alterados' abre a comanda por pessoa com o filtro marcado", () => {
    openDialog("2026-11-06T12:10:00Z", { mode: "people", onlyChanged: true });
    expect(
      screen.getByRole("button", { name: "Uma por pessoa" }).getAttribute("aria-pressed"),
    ).toBe("true");
    const preview = screen.getByLabelText("Prévia da comanda");
    expect(within(preview).getAllByRole("article")).toHaveLength(2);
  });

  it("sem alterações, o filtro 'só alterados' fica desabilitado", () => {
    openDialog("2026-11-06T13:00:00Z", { mode: "people" });
    const box = screen.getByLabelText(/Só os que mudaram/) as HTMLInputElement;
    expect(box.disabled).toBe(true);
  });
});

describe("altura da bobina", () => {
  const rect = (top: number, height: number) => ({ top, height, bottom: top + height }) as DOMRect;
  const build = (ticketHeights: number[] | null, sheetHeight = 0) => {
    const sheet = document.createElement("div");
    sheet.getBoundingClientRect = () => rect(0, sheetHeight);
    let y = 100; // cabeçalho de 100 px antes do primeiro ticket
    for (const h of ticketHeights ?? []) {
      const t = document.createElement("div");
      t.className = "comanda__ticket";
      const top = y;
      t.getBoundingClientRect = () => rect(top, h);
      sheet.appendChild(t);
      y += h;
    }
    return sheet;
  };

  it("consolidada: altura da folha inteira em mm, com folga", () => {
    // 378 px = 100 mm; + 8 mm de folga
    expect(rollHeightMm(build(null, 378))).toBe(Math.ceil((378 * 25.4) / 96 + 8));
  });
  it("por pessoa: usa a maior página (a primeira inclui o cabeçalho)", () => {
    const a = rollHeightMm(build([200, 300]))!; // maior = 300 (cabeçalho+200 = 300)
    const b = rollHeightMm(build([300, 200]))!; // 1ª página = 100+300 = 400
    expect(b).toBeGreaterThan(a);
    expect(a).toBe(Math.ceil(((300 + 48) * 25.4) / 96 + 8));
    expect(b).toBe(Math.ceil(((400 + 48) * 25.4) / 96 + 8));
  });
  it("sem layout (altura 0) devolve null", () => {
    expect(rollHeightMm(build(null, 0))).toBeNull();
  });
});
