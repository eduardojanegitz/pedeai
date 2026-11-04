export type PhoneResult = { ok: true; e164: string } | { ok: false; message: string };

/**
 * Normaliza um celular brasileiro (com DDD) para E.164: "+55" + DDD + 9 dígitos.
 * Aceita máscara, espaços, "+55" e "0" de tronco. Telefone fixo e números sem DDD são recusados.
 */
export function parseBrazilianMobile(input: string): PhoneResult {
  let d = input.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length >= 11 && d.startsWith("0")) d = d.slice(1); // "0" de tronco antes do DDD
  if (d.length === 10 && /^[1-9][1-9][6-9]/.test(d)) {
    return { ok: false, message: "Use o celular com 9 dígitos: (DDD) 9XXXX-XXXX." };
  }
  if (d.length !== 11 || !/^[1-9][1-9]9\d{8}$/.test(d)) {
    return { ok: false, message: "Informe DDD + celular, por exemplo (15) 99999-9999." };
  }
  return { ok: true, e164: `+55${d}` };
}

/** Máscara de digitação: "(15) 99999-9999". */
export function maskPhoneInput(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Formata um E.164 brasileiro para exibição. */
export function formatPhone(e164: string): string {
  return maskPhoneInput(e164.replace(/^\+55/, ""));
}
