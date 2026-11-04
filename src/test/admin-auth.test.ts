import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { authErrorKind, friendlyLoginError, safeAdminRedirect } from "@/lib/admin-auth";
import { routeTree } from "@/routeTree.gen";

describe("admin auth helpers", () => {
  it("classifica erros do servidor", () => {
    expect(authErrorKind(new Error("Unauthorized: No token provided"))).toBe("expired");
    expect(authErrorKind(new Error("Forbidden: esta conta não tem acesso ao painel."))).toBe("forbidden");
    expect(authErrorKind(new Error("Failed to fetch"))).toBeNull();
  });

  it("só redireciona para caminhos internos do painel", () => {
    expect(safeAdminRedirect("/admin/orders")).toBe("/admin/orders");
    expect(safeAdminRedirect("https://evil.example")).toBe("/admin");
    expect(safeAdminRedirect("//evil.example")).toBe("/admin");
    expect(safeAdminRedirect("/admin//evil.example")).toBe("/admin");
    expect(safeAdminRedirect("/admin/login")).toBe("/admin");
    expect(safeAdminRedirect(undefined)).toBe("/admin");
  });

  it("traduz erros de login para mensagens amigáveis", () => {
    expect(friendlyLoginError({ code: "invalid_credentials" })).toMatch(/incorretos/);
    expect(friendlyLoginError({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(friendlyLoginError({ message: "Failed to fetch" })).toMatch(/conexão/);
  });
});

describe("rotas do admin", () => {
  it("/admin/login existe fora do layout protegido", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const ids = router.matchRoutes("/admin/login").map((m) => m.routeId);
    expect(ids).toContain("/admin_/login");
    expect(ids).not.toContain("/admin");
  });
  it("/admin/orders fica dentro do layout protegido", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/admin/orders").map((m) => m.routeId)).toContain("/admin");
  });
});
