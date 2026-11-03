import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardCopy, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { getRoundOrders, listRounds } from "@/lib/orders.functions";
import { copyText, exportExcel, exportPdf, ranking, toText, totalItems } from "@/lib/export";

const roundsQuery = queryOptions({ queryKey: ["rounds"], queryFn: () => listRounds() });

export const Route = createFileRoute("/admin/orders")({
  loader: ({ context }) => context.queryClient.ensureQueryData(roundsQuery),
  pendingComponent: () => <div className="h-40 animate-pulse rounded-3xl bg-muted" />,
  component: OrdersPage,
});

const btn =
  "pop-press inline-flex items-center gap-2 rounded-full border-2 border-foreground px-4 py-2 font-bold shadow-pop disabled:opacity-50";

function Counter({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  useEffect(() => {
    const c = animate(mv, value, { duration: reduce ? 0 : 0.8, ease: "easeOut" });
    return () => c.stop();
  }, [value, mv, reduce]);
  return <motion.span>{rounded}</motion.span>;
}

function OrdersPage() {
  const { data: rounds } = useSuspenseQuery(roundsQuery);
  const [roundId, setRoundId] = useState<string | undefined>(rounds[0]?.id);
  const round = rounds.find((r) => r.id === roundId);
  const q = useQuery({
    queryKey: ["round-orders", roundId],
    queryFn: () => getRoundOrders({ data: { roundId: roundId! } }),
    enabled: !!roundId,
  });
  const orders = q.data ?? [];

  const run = (fn: () => Promise<void>, ok?: string) => async () => {
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch {
      toast.error("Não foi possível concluir a exportação.");
    }
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Painel</p>
          <h1 className="text-6xl text-primary">Pedidos</h1>
        </div>
        {rounds.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="round" className="sr-only">Rodada</label>
            <select
              id="round"
              value={roundId}
              onChange={(e) => setRoundId(e.target.value)}
              className="rounded-full border-2 border-foreground bg-card px-4 py-2 font-bold"
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.status === "open" ? "(aberta)" : ""}
                </option>
              ))}
            </select>
            <button aria-label="Atualizar" className={`${btn} bg-card`} onClick={() => q.refetch()}>
              <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}
      </header>

      {!round ? (
        <div className="pop-card p-10 text-center">
          <h2 className="text-4xl">Nenhuma rodada</h2>
          <p className="mt-2 text-muted-foreground">Abra uma rodada na aba Rodadas para receber pedidos.</p>
        </div>
      ) : q.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="pop-card p-10 text-center">
          <h2 className="text-4xl">Sem pedidos ainda</h2>
          <p className="mt-2 text-muted-foreground">Os pedidos confirmados aparecem aqui.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="pop-card bg-secondary p-5 text-secondary-foreground">
              <p className="text-sm font-bold uppercase tracking-widest">Participantes</p>
              <p className="font-display text-6xl"><Counter value={orders.length} /></p>
            </div>
            <div className="pop-card bg-accent p-5 text-accent-foreground">
              <p className="text-sm font-bold uppercase tracking-widest">Itens</p>
              <p className="font-display text-6xl"><Counter value={totalItems(orders)} /></p>
            </div>
          </div>

          <div className="mb-8 flex flex-wrap gap-2">
            <button className={`${btn} bg-primary text-primary-foreground`} onClick={run(() => exportPdf(round.name, orders))}>
              <FileText className="h-4 w-4" /> PDF
            </button>
            <button className={`${btn} bg-card`} onClick={run(() => exportExcel(round.name, orders))}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
            <button
              className={`${btn} bg-card`}
              onClick={run(() => copyText(toText(round.name, orders)), "Copiado para a área de transferência")}
            >
              <ClipboardCopy className="h-4 w-4" /> Copiar texto
            </button>
          </div>

          <section className="mb-8">
            <h2 className="mb-3 text-3xl">Mais pedidos</h2>
            <ul className="pop-card divide-y-2 divide-foreground/10 overflow-hidden">
              {ranking(orders).map((r, i) => (
                <li key={r.product} className="flex items-center justify-between px-4 py-2">
                  <span><span className="mr-2 font-display text-2xl text-primary">{i + 1}</span>{r.product}</span>
                  <span className="font-bold">{r.quantity}</span>
                </li>
              ))}
            </ul>
          </section>

          <h2 className="mb-3 text-3xl">Por participante</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {orders.map((o, i) => (
              <motion.li
                key={o.order_id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                className="pop-card p-4"
              >
                <h3 className="text-3xl">{o.participant}</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {o.items.map((it) => (
                    <li key={it.product_id} className="flex justify-between gap-2">
                      <span>{it.product}</span>
                      <span className="font-bold">{it.quantity}x</span>
                    </li>
                  ))}
                </ul>
              </motion.li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
