import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel — Cardápio Digital" },
      { name: "description", content: "Gerencie produtos, rodadas e pedidos do cardápio." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

const tabs = [
  { to: "/admin", label: "Produtos", exact: true },
  { to: "/admin/rounds", label: "Rodadas", exact: false },
  { to: "/admin/orders", label: "Pedidos", exact: false },
] as const;

function AdminLayout() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <div className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-foreground bg-accent p-4 text-accent-foreground">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p className="text-sm font-medium">
          Painel aberto: qualquer pessoa com este endereço pode alterar o cardápio e ver os pedidos. Use apenas
          internamente.
        </p>
      </div>
      <nav aria-label="Seções do painel" className="mb-8 flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: t.exact }}
            className="pop-press rounded-full border-2 border-foreground bg-card px-5 py-2 font-bold shadow-pop"
            activeProps={{ className: "bg-primary text-primary-foreground" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </main>
  );
}
