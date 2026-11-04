import { describe, expect, it } from "vitest";

import { mapOrderError } from "@/lib/order-errors";
import { formatPhone, maskPhoneInput, parseBrazilianMobile } from "@/lib/phone";
import {
  formatRecoveryCode,
  generateRecoveryCode,
  isWellFormedRecoveryCode,
  normalizeRecoveryCode,
} from "@/lib/recovery-code";

describe("celular brasileiro", () => {
  it.each([
    ["(15) 99999-9999", "+5515999999999"],
    ["15999999999", "+5515999999999"],
    ["+55 (15) 99999-9999", "+5515999999999"],
    ["5515999999999", "+5515999999999"],
    ["015 99999-9999", "+5515999999999"],
    ["55 99999-9999", "+5555999999999"], // DDD 55 (RS), 11 dígitos: não confundir com o +55
  ])("normaliza %s", (input, expected) => {
    expect(parseBrazilianMobile(input)).toEqual({ ok: true, e164: expected });
  });

  it.each(["", "99999-9999", "(15) 3333-4444", "(00) 99999-9999", "123", "(15) 89999-9999"])(
    "recusa %s",
    (input) => {
      expect(parseBrazilianMobile(input).ok).toBe(false);
    },
  );

  it("sugere o 9º dígito para celular antigo", () => {
    const r = parseBrazilianMobile("(15) 9999-9999");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/9 dígitos/);
  });

  it("aplica máscara e formata para exibição", () => {
    expect(maskPhoneInput("15999")).toBe("(15) 999");
    expect(maskPhoneInput("15999999999")).toBe("(15) 99999-9999");
    expect(maskPhoneInput("+5515999999999")).toBe("(15) 99999-9999");
    expect(formatPhone("+5515999999999")).toBe("(15) 99999-9999");
  });
});

describe("código de recuperação", () => {
  it("gera códigos bem formados e diferentes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = generateRecoveryCode();
      expect(c).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
      expect(isWellFormedRecoveryCode(c)).toBe(true);
      seen.add(c);
    }
    expect(seen.size).toBe(200);
  });

  it("aceita minúsculas, espaços e sem hífen", () => {
    expect(normalizeRecoveryCode(" k7m2q 9xawb ")).toBe("K7M2Q9XAWB");
    expect(formatRecoveryCode("k7m2q9xawb")).toBe("K7M2Q-9XAWB");
    expect(isWellFormedRecoveryCode("k7m2q9xawb")).toBe(true);
  });

  it("recusa códigos com tamanho ou símbolos inválidos", () => {
    expect(isWellFormedRecoveryCode("K7M2Q")).toBe(false);
    expect(isWellFormedRecoveryCode("K7M2Q-9XAW0")).toBe(false); // 0 não existe no alfabeto
    expect(isWellFormedRecoveryCode("")).toBe(false);
  });
});

describe("erros do pedido", () => {
  it("mapeia códigos do banco para mensagens", () => {
    expect(mapOrderError("CATEGORY_MIN", "Acompanhamentos")).toEqual({
      code: "CATEGORY_MIN",
      message: "Escolha mais itens em Acompanhamentos.",
    });
    expect(mapOrderError("VERSION_CONFLICT").code).toBe("VERSION_CONFLICT");
    expect(mapOrderError("ROUND_CLOSED").message).toMatch(/encerrados/);
    expect(mapOrderError("algo inesperado").code).toBe("UNKNOWN");
  });
});
