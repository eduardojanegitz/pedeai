/** Observação por item ("sem cebola"). Limite e limpeza iguais no navegador, no servidor e no banco. */
export const NOTE_MAX = 140;

/* eslint-disable no-control-regex -- remover caracteres de controle é o objetivo */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
/* eslint-enable no-control-regex */

/** Remove controles, junta espaços repetidos e apara. Vazio vira null. Não corta além do limite. */
export function cleanNote(input: string | null | undefined): string | null {
  const s = (input ?? "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}
