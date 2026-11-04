import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-middleware";

/** Confirma, no servidor, que a sessão atual é de um administrador. */
export const getAdminSession = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string }).email ?? null;
    return { adminId: context.adminId, email };
  });
