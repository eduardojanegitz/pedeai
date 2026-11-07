import { describe, expect, it } from "vitest";

import { crc16, maskPixKey, normalizePixKey, pixPayload, pixText } from "@/lib/pix";

/** Decodificador TLV independente, só para conferir a estrutura do que o gerador produz. */
function parseTlv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(len) || i + 4 + len > s.length)
      throw new Error(`TLV inválido em ${i}`);
    out[id] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

describe("CRC do BR Code", () => {
  it("bate com o exemplo oficial do manual do Banco Central", () => {
    const body =
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
    expect(crc16(body)).toBe("1D3D");
  });
});

describe("pixPayload", () => {
  const base = { key: "12345678909", name: "Maria Aparecida", city: "Sorocaba" };

  it("estrutura completa: campos, valor e CRC válido", () => {
    const code = pixPayload({ ...base, amountCents: 1250 });
    const top = parseTlv(code);
    expect(top["00"]).toBe("01");
    const account = parseTlv(top["26"]!);
    expect(account["00"]).toBe("br.gov.bcb.pix");
    expect(account["01"]).toBe("12345678909");
    expect(top["52"]).toBe("0000");
    expect(top["53"]).toBe("986");
    expect(top["54"]).toBe("12.50");
    expect(top["58"]).toBe("BR");
    expect(top["59"]).toBe("MARIA APARECIDA");
    expect(top["60"]).toBe("SOROCABA");
    expect(parseTlv(top["62"]!)["05"]).toBe("***");
    // CRC: últimos 4 caracteres, calculado sobre tudo até "6304"
    expect(top["63"]).toBe(code.slice(-4));
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));
    expect(code.slice(-8, -4)).toBe("6304");
  });

  it("formata o valor com ponto e duas casas", () => {
    const amount = (c: number) => parseTlv(pixPayload({ ...base, amountCents: c }))["54"];
    expect(amount(1)).toBe("0.01");
    expect(amount(100)).toBe("1.00");
    expect(amount(123456)).toBe("1234.56");
  });

  it("sem valor não inclui o campo 54", () => {
    expect(parseTlv(pixPayload(base))["54"]).toBeUndefined();
  });

  it("tamanho dos campos acompanha o texto (UTF-8 sem acento)", () => {
    const code = pixPayload({
      key: "voce@exemplo.com.br",
      name: "José da Conceição Ñandú Souza Longo",
      city: "São José dos Campos do Norte",
      amountCents: 500,
    });
    const top = parseTlv(code);
    expect(top["59"]!.length).toBeLessThanOrEqual(25);
    expect(top["60"]!.length).toBeLessThanOrEqual(15);
    expect(/^[A-Z0-9 ]+$/.test(top["59"]! + top["60"]!)).toBe(true);
  });

  it("recusa valor inválido, chave longa e nome ou cidade vazios", () => {
    for (const bad of [0, -1, 1.5, 100_000_000, Number.NaN])
      expect(() => pixPayload({ ...base, amountCents: bad })).toThrow();
    expect(() => pixPayload({ ...base, key: "x".repeat(78) })).toThrow();
    expect(() => pixPayload({ ...base, key: "" })).toThrow();
    expect(() => pixPayload({ ...base, name: "  ***  " })).toThrow();
    expect(() => pixPayload({ ...base, city: "" })).toThrow();
  });

  it("mudar qualquer dado muda o CRC (detecta adulteração)", () => {
    const a = pixPayload({ ...base, amountCents: 1000 });
    const b = pixPayload({ ...base, amountCents: 1001 });
    expect(a.slice(-4)).not.toBe(b.slice(-4));
    const forged = a.replace("10.00", "99.99");
    expect(crc16(forged.slice(0, -4))).not.toBe(forged.slice(-4));
  });
});

describe("pixText", () => {
  it("remove acentos, põe em maiúsculas e limita", () => {
    expect(pixText("São José", 25)).toBe("SAO JOSE");
    expect(pixText("  muitos    espaços  ", 25)).toBe("MUITOS ESPACOS");
    expect(pixText("a-b_c.d/e", 25)).toBe("A B C D E");
    expect(pixText("x".repeat(40), 25)).toHaveLength(25);
    expect(pixText("***", 25)).toBe("");
  });
});

describe("chaves Pix", () => {
  it("CPF: aceita máscara e confere os dígitos", () => {
    expect(normalizePixKey("cpf", "529.982.247-25")).toEqual({ ok: true, key: "52998224725" });
    expect(normalizePixKey("cpf", "111.111.111-11").ok).toBe(false);
    expect(normalizePixKey("cpf", "529.982.247-26").ok).toBe(false);
    expect(normalizePixKey("cpf", "123").ok).toBe(false);
  });
  it("CNPJ: aceita máscara e confere os dígitos", () => {
    expect(normalizePixKey("cnpj", "11.222.333/0001-81")).toEqual({
      ok: true,
      key: "11222333000181",
    });
    expect(normalizePixKey("cnpj", "11.222.333/0001-82").ok).toBe(false);
    expect(normalizePixKey("cnpj", "00000000000000").ok).toBe(false);
  });
  it("e-mail: minúsculas e formato", () => {
    expect(normalizePixKey("email", " Voce@Exemplo.com.BR ")).toEqual({
      ok: true,
      key: "voce@exemplo.com.br",
    });
    expect(normalizePixKey("email", "sem-arroba").ok).toBe(false);
    expect(normalizePixKey("email", "a@b").ok).toBe(false);
  });
  it("celular: vira +55 com DDD", () => {
    expect(normalizePixKey("phone", "(15) 99999-9999")).toEqual({
      ok: true,
      key: "+5515999999999",
    });
    expect(normalizePixKey("phone", "12345").ok).toBe(false);
  });
  it("chave aleatória: UUID", () => {
    expect(normalizePixKey("random", "123E4567-E12B-12D1-A456-426655440000")).toEqual({
      ok: true,
      key: "123e4567-e12b-12d1-a456-426655440000",
    });
    expect(normalizePixKey("random", "nao-e-uuid").ok).toBe(false);
  });
  it("vazio é recusado em qualquer tipo", () => {
    for (const t of ["cpf", "cnpj", "email", "phone", "random"] as const)
      expect(normalizePixKey(t, "  ").ok).toBe(false);
  });
  it("máscara esconde o miolo", () => {
    expect(maskPixKey("cpf", "52998224725")).toBe("529***725");
    expect(maskPixKey("email", "voce@exemplo.com.br")).toBe("vo***@exemplo.com.br");
    expect(maskPixKey("cpf", "123")).toBe("***");
    expect(maskPixKey("cpf", "52998224725")).not.toContain("98224");
  });
});
