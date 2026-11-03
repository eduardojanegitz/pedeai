import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Lock, Play } from "lucide-react";
import { closeRound, listRounds, openRound } from "@/lib/orders.functions";

const roundsQuery = queryOptions({ queryKey: ["rounds"], queryFn: () => listRounds() });

export const Route = createFileRoute("/admin/rounds")({
  loader: ({ context }) => context.queryClient.ensureQueryData(roundsQuery),
  pendingComponent: () => <div className="h-40 animate-pulse rounded-3xl bg-muted" />,
  component: RoundsPage,
});

const btn =
  "pop-press inline-flex items-center gap-2 rounded-full border-2 border-foreground px-4 py-2 font-bold shadow-pop disabled:opacity-50";
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function RoundsPage() {
  const { data: rounds } = useSuspenseQuery(roundsQuery);
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rounds"] });
    qc.invalidateQueries({ queryKey: ["active-round"] });
  };
  const open = useServerFn(openRound);
  const close = useServerFn(closeRound);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const active = rounds.find((r) => r.status === "open");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await open({ data: { name } });
      setName("");
      toast.success("Rodada aberta!");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Painel</p>
      <h1 className="mb-6 text-6xl text-primary">Rodadas</h1>

      {active ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="pop-card mb-8 flex flex-wrap items-center justify-between gap-4 bg-accent p-6"
        >
          <div>
            <p className="text-sm font-bold uppercase tracking-widest">Rodada aberta</p>
            <h2 className="text-5xl">{active.name}</h2>
            <p className="text-sm">Aberta em {fmt(active.opened_at)}</p>
          </div>
          <button
            className={`${btn} bg-foreground text-background`}
            onClick={async () => {
              if (!confirm(`Encerrar "${active.name}"? Ninguém poderá mais editar pedidos.`)) return;
              try {
                await close({ data: { id: active.id } });
                toast.success("Rodada encerrada");
                refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Algo deu errado.");
              }
            }}
          >
            <Lock className="h-4 w-4" /> Encerrar rodada
          </button>
        </motion.section>
      ) : (
        <form onSubmit={submit} className="pop-card mb-8 space-y-3 p-6">
          <h2 className="text-4xl">Abrir nova rodada</h2>
          <p className="text-sm text-muted-foreground">Só uma rodada pode ficar aberta por vez.</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Ex.: Almoço de sexta"
              aria-label="Nome da rodada"
              className="min-w-0 flex-1 rounded-full border-2 border-foreground bg-card px-4 py-2 outline-none focus:ring-2 focus:ring-ring"
            />
            <button disabled={busy || !name.trim()} className={`${btn} bg-primary text-primary-foreground`}>
              <Play className="h-4 w-4" /> Abrir
            </button>
          </div>
        </form>
      )}

      <h2 className="mb-3 text-3xl">Histórico</h2>
      {rounds.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma rodada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {rounds.map((r) => (
            <li key={r.id} className="pop-card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-bold">{r.name}</span>
              <span className="text-sm text-muted-foreground">
                {fmt(r.opened_at)}
                {r.closed_at ? ` → ${fmt(r.closed_at)}` : ""} · {r.status === "open" ? "aberta" : "encerrada"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
