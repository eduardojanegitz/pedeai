import { parseBrazilianMobile } from "@/lib/phone";

/**
 * Pix estático ("copia e cola" / QR): validação da chave e montagem do BR Code (EMV® QRCPS, manual do
 * Banco Central). O app só GERA o código; quem confirma o recebimento é o organizador.
 */

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

export const PIX_KEY_LABEL: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Celular",
  random: "Chave aleatória",
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

function validCpf(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function validCnpj(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export type PixKeyResult = { ok: true; key: string } | { ok: false; error: string };

/** Valida e normaliza a chave Pix conforme o tipo escolhido (CPF/CNPJ só dígitos, celular em +55…). */
export function normalizePixKey(type: PixKeyType, input: string): PixKeyResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Informe a chave Pix." };
  switch (type) {
    case "cpf": {
      const d = onlyDigits(raw);
      return validCpf(d) ? { ok: true, key: d } : { ok: false, error: "CPF inválido." };
    }
    case "cnpj": {
      const d = onlyDigits(raw);
      return validCnpj(d) ? { ok: true, key: d } : { ok: false, error: "CNPJ inválido." };
    }
    case "email": {
      const e = raw.toLowerCase();
      return e.length <= 77 && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e)
        ? { ok: true, key: e }
        : { ok: false, error: "E-mail inválido." };
    }
    case "phone": {
      const p = parseBrazilianMobile(raw);
      return p.ok
        ? { ok: true, key: p.e164 }
        : { ok: false, error: "Celular inválido. Use DDD + número, ex.: (15) 99999-9999." };
    }
    case "random": {
      const k = raw.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k)
        ? { ok: true, key: k }
        : {
            ok: false,
            error:
              "Chave aleatória inválida. Ela tem o formato 123e4567-e12b-12d1-a456-426655440000.",
          };
    }
  }
}

/** Mostra só o começo e o fim da chave (para telas e registros): 123.***.***-09 */
export function maskPixKey(type: PixKeyType, key: string): string {
  if (type === "email") {
    const [user = "", domain = ""] = key.split("@");
    return `${user.slice(0, 2)}***@${domain}`;
  }
  if (key.length <= 6) return "***";
  return `${key.slice(0, 3)}***${key.slice(-3)}`;
}

/** Texto do BR Code: sem acentos, maiúsculas, só letras/números/espaço, limitado ao tamanho do campo. */
export function pixText(input: string, max: number): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, início 0xFFFF), em hexadecimal maiúsculo com 4 dígitos. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PixPayloadInput = {
  key: string;
  /** Nome do recebedor (até 25 caracteres no código). */
  name: string;
  /** Cidade do recebedor (até 15 caracteres no código). */
  city: string;
  /** Valor em centavos; omitido = quem paga digita o valor. */
  amountCents?: number | undefined;
};

/** Monta o código "copia e cola" do Pix (estático). Lança erro se os dados forem inválidos. */
export function pixPayload({ key, name, city, amountCents }: PixPayloadInput): string {
  const n = pixText(name, 25);
  const c = pixText(city, 15);
  if (!key || key.length > 77) throw new Error("Chave Pix inválida.");
  if (!n) throw new Error("Nome do recebedor inválido.");
  if (!c) throw new Error("Cidade do recebedor inválida.");
  if (
    amountCents !== undefined &&
    (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 99_999_999)
  )
    throw new Error("Valor inválido.");
  const account = tlv("00", "br.gov.bcb.pix") + tlv("01", key);
  const body =
    tlv("00", "01") +
    tlv("26", account) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (amountCents !== undefined ? tlv("54", (amountCents / 100).toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", n) +
    tlv("60", c) +
    tlv("62", tlv("05", "***")) +
    "6304";
  return body + crc16(body);
}
