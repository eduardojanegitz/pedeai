import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveCategory = vi.fn(async (_: unknown) => ({ ok: true }));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/catalog.functions", () => ({ saveCategory: (arg: unknown) => saveCategory(arg) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CategoryDialog } from "@/features/admin/CategoryDialog";

const setup = (category: Parameters<typeof CategoryDialog>[0]["category"] = "new") => {
  const onSaved = vi.fn();
  render(<CategoryDialog category={category} onClose={() => {}} onSaved={onSaved} />);
  return { onSaved };
};
const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("CategoryDialog", () => {
  beforeEach(() => saveCategory.mockClear());

  it("mostra como o participante verá a regra", () => {
    setup();
    type(/^Nome/, "Acompanhamentos");
    type(/Mínimo/, "2");
    type(/Máximo/, "2");
    expect(screen.getByText(/Participantes verão/).textContent).toContain(
      "Escolha 2 acompanhamentos",
    );
  });

  it("recusa máximo menor que o mínimo e não salva", async () => {
    setup();
    type(/^Nome/, "Bebidas");
    type(/Mínimo/, "3");
    type(/Máximo/, "2");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("O máximo não pode ser menor que o mínimo")).toBeTruthy();
    expect(saveCategory).not.toHaveBeenCalled();
  });

  it("recusa nome vazio", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Informe um nome")).toBeTruthy();
    expect(saveCategory).not.toHaveBeenCalled();
  });

  it("salva o cenário inicial com os valores validados", async () => {
    const { onSaved } = setup();
    type(/^Nome/, "Prato principal");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveCategory).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Prato principal",
        min_select: 1,
        max_select: 1,
        allow_quantity: false,
        is_active: true,
      }),
    });
  });

  it("editar mantém o id e os valores existentes", async () => {
    const { onSaved } = setup({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Acompanhamentos",
      description: null,
      position: 1,
      min_select: 2,
      max_select: 2,
      allow_quantity: false,
      is_active: false,
    });
    expect((screen.getByLabelText(/Mínimo/) as HTMLInputElement).value).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveCategory).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        is_active: false,
      }),
    });
  });
});
