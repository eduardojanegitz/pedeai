import { createMiddleware } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Exige um usuário autenticado (JWT válido) que esteja na tabela `admins`.
 * A checagem é feita no servidor com o client administrativo; o frontend só redireciona.
 * Erros começam com "Unauthorized" (sem sessão/token inválido) ou "Forbidden" (sem permissão).
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // `admins` entra nos tipos gerados só depois da migração; por isso o client sem schema tipado.
    const db = supabaseAdmin as unknown as SupabaseClient;
    const { data, error } = await db
      .from("admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) {
      console.error(error);
      throw new Error("Não foi possível verificar o acesso. Tente novamente.");
    }
    if (!data) throw new Error("Forbidden: esta conta não tem acesso ao painel.");
    return next({ context: { adminId: context.userId } });
  });
