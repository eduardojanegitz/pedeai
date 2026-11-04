// Sem I, L, O, 0 e 1 para evitar confusão ao ler/digitar. 31 símbolos × 10 posições ≈ 49,5 bits.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 10;

/** Código de recuperação aleatório (crypto), sem viés. Ex.: "K7M2Q-9XAWB". */
export function generateRecoveryCode(): string {
  const out: string[] = [];
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(LENGTH * 2));
    for (const b of bytes) {
      if (b < limit && out.length < LENGTH) out.push(ALPHABET[b % ALPHABET.length]!);
    }
  }
  return formatRecoveryCode(out.join(""));
}

export function formatRecoveryCode(code: string): string {
  const c = normalizeRecoveryCode(code);
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

/** Aceita minúsculas, espaços e hífen digitados pelo usuário. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isWellFormedRecoveryCode(input: string): boolean {
  const c = normalizeRecoveryCode(input);
  return c.length === LENGTH && [...c].every((ch) => ALPHABET.includes(ch));
}
