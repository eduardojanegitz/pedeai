import { describe, expect, it } from "vitest";

import {
  buildSteps,
  canAdd,
  counterText,
  invalidSteps,
  limitMessage,
  stepStatus,
  stepTitle,
  totalCents,
  type Cart,
} from "@/features/order/logic";
import type { MenuCategory, MenuProduct } from "@/lib/catalog.functions";

const cat = (
  id: string,
  name: string,
  position: number,
  min: number,
  max: number,
  extra: Partial<MenuCategory> = {},
): MenuCategory => ({
  id,
  name,
  description: null,
  position,
  min_select: min,
  max_select: max,
  allow_quantity: false,
  is_active: true,
  ...extra,
});
const prod = (
  id: string,
  category_id: string | null,
  extra: Partial<MenuProduct> = {},
): MenuProduct => ({
  id,
  name: id,
  description: null,
  category_id,
  image_path: null,
  image_url: null,
  position: 0,
  is_active: true,
  price_cents: null,
  ...extra,
});

const categories = [
  cat("side", "Acompanhamentos", 2, 2, 2),
  cat("main", "Prato principal", 1, 1, 1),
  cat("off", "Sobremesa", 3, 0, 1, { is_active: false }),
  cat("empty", "Vazia", 4, 0, 1),
];
const products = [
  prod("frango", "main"),
  prod("lasanha", "main"),
  prod("arroz", "side"),
  prod("pure", "side"),
  prod("farofa", "side"),
  prod("pudim", "off"),
  prod("sem-cat", null),
  prod("velho", "main", { is_active: false }),
];
const steps = buildSteps(categories, products);

describe("etapas dinâmicas", () => {
  it("ordena por posição e ignora categorias inativas ou sem produtos ativos", () => {
    expect(steps.map((s) => s.category.id)).toEqual(["main", "side"]);
    expect(steps[0]!.products.map((p) => p.id)).toEqual(["frango", "lasanha"]); // "velho" inativo fora
  });
});

describe("limites", () => {
  it("conta opções diferentes e bloqueia ao atingir o máximo", () => {
    const side = steps[1]!;
    let cart: Cart = { arroz: 1 };
    expect(stepStatus(cart, side)).toMatchObject({ picked: 1, satisfied: false, full: false });
    expect(canAdd(cart, side, "pure")).toBe(true);
    cart = { arroz: 1, pure: 1 };
    expect(stepStatus(cart, side)).toMatchObject({ picked: 2, satisfied: true, full: true });
    expect(canAdd(cart, side, "farofa")).toBe(false);
    expect(canAdd(cart, side, "arroz")).toBe(false); // já escolhida
  });

  it("quantidade maior que 1 não aumenta a contagem de opções", () => {
    expect(stepStatus({ arroz: 3 }, steps[1]!).picked).toBe(1);
  });

  it("aponta etapas inválidas (abaixo do mínimo ou acima do máximo)", () => {
    expect(invalidSteps({}, steps).map((i) => [i.step.category.id, i.reason])).toEqual([
      ["main", "min"],
      ["side", "min"],
    ]);
    expect(invalidSteps({ frango: 1, arroz: 1, pure: 1 }, steps)).toEqual([]);
    expect(
      invalidSteps({ frango: 1, lasanha: 1, arroz: 1, pure: 1 }, steps).map((i) => [
        i.step.category.id,
        i.reason,
      ]),
    ).toEqual([["main", "max"]]);
  });

  it("categoria com mínimo 0 é opcional", () => {
    const s = buildSteps([cat("x", "Extras", 1, 0, 2)], [prod("a", "x")]);
    expect(invalidSteps({}, s)).toEqual([]);
  });
});

describe("textos", () => {
  it("títulos e contador", () => {
    expect(stepTitle(categories[1]!)).toBe("Escolha 1 prato principal");
    expect(stepTitle(categories[0]!)).toBe("Escolha 2 acompanhamentos");
    expect(stepTitle(cat("b", "Bebidas", 1, 1, 3))).toBe("Escolha de 1 a 3 em Bebidas");
    expect(stepTitle(cat("e", "Extras", 1, 0, 2))).toBe("Escolha até 2 em Extras (opcional)");
    expect(counterText(stepStatus({ arroz: 1 }, steps[1]!))).toBe("1 de 2 selecionados");
    expect(counterText(stepStatus({}, steps[0]!))).toBe("0 de 1 selecionado");
  });
  it("mensagem de limite atingido", () => {
    expect(limitMessage(categories[0]!)).toBe("Você já escolheu seus 2 acompanhamentos!");
    expect(limitMessage(categories[1]!)).toBe("Você já escolheu em Prato principal!");
  });
});

describe("valores", () => {
  it("só mostra total quando há preço", () => {
    expect(totalCents({ frango: 1, arroz: 1 }, steps)).toBeNull();
    const priced = buildSteps(categories, [
      prod("frango", "main", { price_cents: 2500 }),
      prod("arroz", "side", { price_cents: 500 }),
    ]);
    expect(totalCents({ frango: 1, arroz: 2 }, priced)).toBe(3500);
  });
});
