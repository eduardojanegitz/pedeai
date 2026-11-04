import { describe, expect, it } from "vitest";

import {
  categoryInputSchema,
  centsToInput,
  parsePriceToCents,
  ruleSummary,
} from "@/lib/category-rules";
import { isoToSpLocal, scheduleSchema, spLocalToIso } from "@/lib/schedule";

const base = {
  name: "Prato principal",
  description: null,
  min_select: 1,
  max_select: 1,
  allow_quantity: false,
  is_active: true,
};

describe("regras da categoria", () => {
  it("aceita o cenário inicial (1/1 e 2/2)", () => {
    expect(categoryInputSchema.safeParse(base).success).toBe(true);
    expect(
      categoryInputSchema.safeParse({
        ...base,
        name: "Acompanhamentos",
        min_select: 2,
        max_select: 2,
      }).success,
    ).toBe(true);
  });

  it("recusa máximo menor que o mínimo", () => {
    const r = categoryInputSchema.safeParse({ ...base, min_select: 3, max_select: 2 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/máximo não pode ser menor/);
  });

  it("recusa máximo 0, negativo, decimal e nome vazio", () => {
    expect(categoryInputSchema.safeParse({ ...base, max_select: 0 }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ ...base, min_select: -1 }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ ...base, max_select: 1.5 }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });

  it("mínimo 0 deixa a categoria opcional e descrição vazia vira null", () => {
    const r = categoryInputSchema.parse({
      ...base,
      min_select: 0,
      max_select: 3,
      description: "  ",
    });
    expect(r.description).toBeNull();
    expect(ruleSummary(0, 3)).toBe("Até 3 (opcional)");
    expect(ruleSummary(2, 2)).toBe("Escolha 2");
    expect(ruleSummary(1, 3)).toBe("De 1 a 3");
  });
});

describe("preço", () => {
  it.each([
    ["12,50", 1250],
    ["R$ 12,50", 1250],
    ["12.5", 1250],
    ["1.234,56", 123456],
    ["0", 0],
    ["", null],
  ])("converte %s", (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents);
  });
  it("recusa lixo e valores absurdos", () => {
    expect(parsePriceToCents("abc")).toBeUndefined();
    expect(parsePriceToCents("12,505")).toBeUndefined();
    expect(parsePriceToCents("999999999")).toBeUndefined();
  });
  it("formata para o campo", () => {
    expect(centsToInput(1250)).toBe("12,50");
    expect(centsToInput(null)).toBe("");
  });
});

describe("horários (Brasília)", () => {
  it("converte hora local de Brasília para UTC e volta", () => {
    expect(spLocalToIso("2026-11-04T11:30")).toBe("2026-11-04T14:30:00.000Z");
    expect(isoToSpLocal("2026-11-04T14:30:00.000Z")).toBe("2026-11-04T11:30");
    expect(isoToSpLocal(null)).toBe("");
  });
  it("virada de dia", () => {
    expect(spLocalToIso("2026-11-04T23:30")).toBe("2026-11-05T02:30:00.000Z");
    expect(isoToSpLocal("2026-11-05T02:30:00.000Z")).toBe("2026-11-04T23:30");
  });
  it("recusa formato inválido", () => {
    expect(spLocalToIso("")).toBeNull();
    expect(spLocalToIso("04/11/2026 11:30")).toBeNull();
  });
  it("encerramento precisa ser depois da abertura", () => {
    const ok = scheduleSchema.safeParse({
      opensAt: "2026-11-04T14:00:00.000Z",
      closesAt: "2026-11-04T15:00:00.000Z",
    });
    const bad = scheduleSchema.safeParse({
      opensAt: "2026-11-04T15:00:00.000Z",
      closesAt: "2026-11-04T14:00:00.000Z",
    });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
    expect(scheduleSchema.safeParse({ opensAt: null, closesAt: null }).success).toBe(true);
  });
});
