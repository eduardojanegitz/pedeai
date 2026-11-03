const KEY = "pedeai:token";

/** Código secreto do participante, guardado só neste aparelho. */
export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* navegação privada: o código vale só enquanto a página estiver aberta */
  }
  return token;
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
