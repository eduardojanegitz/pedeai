/** Erro de autenticação/autorização vindo das funções protegidas de servidor. */
export function authErrorKind(e: unknown): "expired" | "forbidden" | null {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (msg.startsWith("Forbidden")) return "forbidden";
  if (msg.startsWith("Unauthorized")) return "expired";
  return null;
}

/** Só aceita caminhos internos do painel, evitando redirecionamento para outros sites. */
export function safeAdminRedirect(path: unknown): string {
  if (typeof path !== "string") return "/admin";
  if (!path.startsWith("/admin") || path.startsWith("/admin/login") || path.includes("//") || path.includes("\\")) {
    return "/admin";
  }
  return path;
}

export function friendlyLoginError(error: { message?: string; status?: number; code?: string } | unknown): string {
  const e = (error ?? {}) as { message?: string; status?: number; code?: string };
  if (e.code === "invalid_credentials" || /invalid login credentials/i.test(e.message ?? "")) {
    return "E-mail ou senha incorretos. Confira e tente de novo.";
  }
  if (e.code === "email_not_confirmed") return "Esta conta ainda não foi confirmada.";
  if (e.status === 429 || /rate limit|too many/i.test(e.message ?? "")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  if (/failed to fetch|network|load failed/i.test(e.message ?? "")) {
    return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
  }
  return "Não foi possível entrar agora. Tente novamente.";
}
