const KEY = "pedeai:token";

/** Código secreto do participante, guardado só neste aparelho. */
export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Gera um código novo SEM guardar (guarde com saveToken depois que o servidor aceitar). */
export function makeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function saveToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* navegação privada: o código vale só enquanto a página estiver aberta */
  }
}

export function newToken(): string {
  const token = makeToken();
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
