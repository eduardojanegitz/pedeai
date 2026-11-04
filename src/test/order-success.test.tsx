import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderSuccess } from "@/features/order/OrderSuccess";

const items = [
  { name: "Frango grelhado", quantity: 1 },
  { name: "Arroz", quantity: 1 },
  { name: "Purê", quantity: 1 },
];

describe("OrderSuccess", () => {
  it("movimento reduzido: mostra direto a mensagem final, sem 'Pular'", () => {
    render(<OrderSuccess variant="created" items={items} onView={() => {}} reduceMotion />);
    expect(screen.getByRole("dialog", { name: "Seu pedido foi confirmado!" })).toBeTruthy();
    expect(screen.getAllByText("Seu pedido foi confirmado!").length).toBeGreaterThan(0);
    expect(screen.getByText(/3 itens/)).toBeTruthy();
    expect(screen.queryByText("Pular animação")).toBeNull();
    expect(screen.getByRole("button", { name: "Ver meu pedido" })).toBeTruthy();
  });

  it("atualização: texto próprio e sem botão de editar", () => {
    render(
      <OrderSuccess
        variant="updated"
        items={items}
        onView={() => {}}
        onEdit={() => {}}
        reduceMotion
      />,
    );
    expect(screen.getAllByText("Seu pedido foi atualizado!").length).toBeGreaterThan(0);
    expect(screen.queryByText("Fazer alterações")).toBeNull();
  });

  it("ações chamam os callbacks e Esc fecha", () => {
    const onView = vi.fn();
    const onEdit = vi.fn();
    render(
      <OrderSuccess variant="created" items={items} onView={onView} onEdit={onEdit} reduceMotion />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ver meu pedido" }));
    fireEvent.click(screen.getByRole("button", { name: /Fazer alterações/ }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onView).toHaveBeenCalledTimes(2);
  });

  it("resumo compacto limita a lista e conta quantidades", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      name: `Item ${i + 1}`,
      quantity: i === 0 ? 2 : 1,
    }));
    render(<OrderSuccess variant="created" items={many} onView={() => {}} reduceMotion />);
    expect(screen.getByText(/8 itens/)).toBeTruthy();
    expect(screen.getByText(/e mais 2/)).toBeTruthy();
    expect(screen.getByText(/2× Item 1/)).toBeTruthy();
  });
});
