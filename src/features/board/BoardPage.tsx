import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bell, BellOff, Check, CheckCircle2, Clock, Pencil, Undo2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import {
  consolidate,
  groupByCategory,
  NO_CATEGORY,
  summarize,
} from "@/features/admin/orders-logic";
import { boardToRoundOrders, type SharedBoard, type SharedBoardResult } from "@/lib/board";
import { getSharedBoard, setBoardOrderDone } from "@/lib/board.functions";
import { formatSaoPauloTime } from "@/lib/format";
import type { RoundState } from "@/lib/orders.functions";
import { BoardPrint } from "./BoardPrint";
import { useBoardAlerts } from "./useBoardAlerts";

const POLL_MS = 8_000;

const STATE: Record<RoundState, { label: string; cls: string }> = {
  waiting: { label: "Aguardando abertura", cls: "bg-accent text-accent-foreground" },
  open: { label: "Recebendo pedidos", cls: "bg-primary text-primary-foreground" },
  closed: { label: "Pedidos encerrados", cls: "bg-muted text-foreground" },
};

const MESSAGES: Record<string, { title: string; text: string }> = {
  invalid: {
    title: "Link inválido",
    text: "Este endereço não é um link válido da comanda. Peça um novo link ao organizador.",
  },
  expired: {
    title: "Link expirado",
    text: "O prazo deste link acabou. Peça um novo link ao organizador.",
  },
  revoked: {
    title: "Link revogado",
    text: "O organizador desativou este link. Peça um novo, se precisar.",
  },
  rate_limited: {
    title: "Muitas consultas",
    text: "Aguarde um instante: a página tenta de novo sozinha.",
  },
};

function Screen({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto max-w-md px-5 py-20 text-center">
      <Logo className="text-6xl" animate={false} />
      <h1 className="mt-6 text-4xl">{title}</h1>
      <p className="mt-3 text-muted-foreground">{text}</p>
    </main>
  );
}

/** Página pública (por link secreto) com a comanda ao vivo para o estabelecimento. */
export function BoardPage({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ["board", token],
    queryFn: () => getSharedBoard({ data: { token } }),
    // Continua consultando enquanto o link vale; links inválidos/expirados/revogados não mudam sozinhos.
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return !s || s === "ok" || s === "rate_limited" ? POLL_MS : false;
    },
    refetchIntervalInBackground: true,
    retry: false,
  });

  const qc = useQueryClient();
  const result = q.data;
  const board = result?.status === "ok" ? result.board : undefined;
  const alerts = useBoardAlerts(board?.orders);

  /** Marca/desmarca "concluído": aparece na hora e volta atrás se o servidor recusar. */
  const toggleDone = async (orderId: string, done: boolean) => {
    const key = ["board", token];
    const patch = (doneAt: string | null) =>
      qc.setQueryData<SharedBoardResult>(key, (old) =>
        old?.status === "ok"
          ? {
              ...old,
              board: {
                ...old.board,
                orders: old.board.orders.map((o) =>
                  o.id === orderId ? { ...o, done_at: doneAt } : o,
                ),
              },
            }
          : old,
      );
    const previous = qc.getQueryData<SharedBoardResult>(key);
    patch(done ? new Date().toISOString() : null);
    try {
      const r = await setBoardOrderDone({ data: { token, orderId, done } });
      if (r.ok) {
        patch(r.doneAt);
        return;
      }
      if (r.status === "not_found") {
        toast.error("Este pedido não está mais na comanda (pode ter sido cancelado).");
        void qc.invalidateQueries({ queryKey: key });
      } else if (r.status === "rate_limited") {
        toast.error("Muitas ações seguidas. Aguarde um instante.");
        qc.setQueryData(key, previous);
      } else {
        qc.setQueryData<SharedBoardResult>(key, { status: r.status });
      }
    } catch {
      toast.error("Não foi possível marcar. Confira a conexão e tente de novo.");
      qc.setQueryData(key, previous);
    }
  };

  if (!result) {
    if (q.isError)
      return (
        <Screen title="Sem conexão" text="Não foi possível carregar a comanda. Tentando de novo…" />
      );
    return <Screen title="Carregando…" text="Buscando a comanda." />;
  }
  if (result.status !== "ok") {
    const m = MESSAGES[result.status]!;
    return <Screen title={m.title} text={m.text} />;
  }
  return (
    <Board
      board={result.board}
      offline={q.isError}
      alerts={alerts}
      updatedAt={q.dataUpdatedAt}
      onToggleDone={(id, done) => void toggleDone(id, done)}
    />
  );
}

type View = "totals" | "people";

function Board({
  board,
  offline,
  alerts,
  updatedAt,
  onToggleDone,
}: {
  board: SharedBoard;
  offline: boolean;
  alerts: ReturnType<typeof useBoardAlerts>;
  updatedAt: number;
  onToggleDone: (orderId: string, done: boolean) => void;
}) {
  const [view, setView] = useState<View>("totals");
  const [onlyPending, setOnlyPending] = useState(false);
  const orders = useMemo(() => boardToRoundOrders(board.orders), [board.orders]);
  const stats = summarize(orders);
  const doneCount = orders.filter((o) => o.done_at).length;
  // "Só pendentes": o que ainda falta fazer (vale para os totais e para a visão por pessoa).
  const shown = useMemo(
    () => (onlyPending ? orders.filter((o) => !o.done_at) : orders),
    [orders, onlyPending],
  );
  const totals = useMemo(() => consolidate(shown), [shown]);
  const state = STATE[board.state];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Logo className="text-4xl" animate={false} />
          <h1 className="mt-2 break-words text-5xl text-primary">{board.roundName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center rounded-full border-2 border-foreground px-3 py-0.5 text-xs font-bold ${state.cls}`}
            >
              {state.label}
            </span>
            {board.closesAt && board.state !== "closed" && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden /> pedidos até{" "}
                {formatSaoPauloTime(board.closesAt)}
              </span>
            )}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground" aria-live="off">
          <p className="inline-flex items-center gap-1.5 font-semibold">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${offline ? "bg-destructive" : "animate-pulse bg-primary"}`}
            />
            {offline ? "Sem conexão" : "Ao vivo"}
          </p>
          <p>
            Atualizado às{" "}
            {formatSaoPauloTime(new Date(updatedAt || Date.parse(board.now)).toISOString())}
          </p>
        </div>
      </header>

      {offline && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 text-sm font-bold text-destructive"
        >
          <WifiOff className="h-4 w-4" aria-hidden /> Sem conexão: mostrando a última comanda
          recebida. Tentando de novo sozinho.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {alerts.supported && (
          <button
            type="button"
            aria-pressed={alerts.enabled}
            onClick={() => void alerts.setEnabled(!alerts.enabled)}
            className={`pop-press inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-foreground px-4 py-2 text-sm font-bold shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${alerts.enabled ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {alerts.enabled ? (
              <Bell className="h-4 w-4" aria-hidden />
            ) : (
              <BellOff className="h-4 w-4" aria-hidden />
            )}
            {alerts.enabled ? "Alerta sonoro ligado" : "Ativar alerta sonoro"}
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          Esta página atualiza sozinha. Deixe-a aberta para acompanhar novos pedidos.
        </p>
      </div>

      {alerts.newIds.size > 0 && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-foreground bg-secondary p-3 text-secondary-foreground"
        >
          <p className="text-sm font-bold">
            {alerts.newIds.size === 1
              ? "1 pedido novo ou alterado"
              : `${alerts.newIds.size} pedidos novos ou alterados`}
          </p>
          <button
            type="button"
            onClick={alerts.markSeen}
            className="pop-press inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-foreground bg-card px-4 py-2 text-sm font-bold text-foreground shadow-pop"
          >
            <Check className="h-4 w-4" aria-hidden /> Marcar como vistos
          </button>
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
        <div className="pop-card bg-secondary p-4 text-secondary-foreground">
          <p className="text-xs font-bold uppercase tracking-widest">Pedidos</p>
          <p className="font-display text-5xl leading-none">{stats.orders}</p>
        </div>
        <div className="pop-card bg-accent p-4 text-accent-foreground">
          <p className="text-xs font-bold uppercase tracking-widest">Itens</p>
          <p className="font-display text-5xl leading-none">{stats.items}</p>
        </div>
        <div className="pop-card bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-widest">Concluídos</p>
          <p className="font-display text-5xl leading-none">
            {doneCount}
            <span className="text-3xl text-muted-foreground">/{stats.orders}</span>
          </p>
        </div>
      </div>

      <div className="mb-5 mt-5 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Visualização"
          className="inline-flex rounded-full border-2 border-foreground bg-card p-1"
        >
          {(
            [
              ["totals", "Totais"],
              ["people", "Por pessoa"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`min-h-10 rounded-full px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === v ? "bg-primary text-primary-foreground" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        {orders.length > 0 && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border-2 border-foreground bg-card px-4">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="h-5 w-5 accent-[var(--primary)]"
            />
            <span className="text-sm font-semibold">Só pendentes</span>
          </label>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="pop-card p-10 text-center">
          <h2 className="text-4xl">Nenhum pedido ainda</h2>
          <p className="mt-2 text-muted-foreground">Os pedidos aparecem aqui assim que chegarem.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="pop-card p-10 text-center">
          <h2 className="text-4xl">Tudo concluído!</h2>
          <p className="mt-2 text-muted-foreground">
            Não há pedidos pendentes. Desmarque o filtro para ver todos.
          </p>
        </div>
      ) : view === "totals" ? (
        <div className="space-y-4">
          {totals.map((c) => (
            <section
              key={c.category ?? NO_CATEGORY}
              aria-label={c.category ?? "Sem categoria"}
              className="pop-card p-4"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-3xl">{c.category ?? "Sem categoria"}</h2>
                <span className="text-sm font-bold text-muted-foreground">
                  {c.quantity} no total
                </span>
              </div>
              <ul className="mt-3 space-y-3">
                {c.products.map((p) => (
                  <li key={p.product_id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-semibold">{p.product}</span>
                      <span className="font-display text-4xl">{p.quantity}</span>
                    </div>
                    {p.notes.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {p.notes.map((n, k) => (
                          <li key={k} className="text-sm font-semibold text-primary">
                            Obs.: {n.text}{" "}
                            <span className="text-muted-foreground">({n.person})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((o) => (
            <li
              key={o.order_id}
              aria-label={o.participant}
              className={`pop-card p-4 ${o.done_at ? "bg-muted/60" : ""} ${alerts.newIds.has(o.order_id) ? "ring-4 ring-primary/50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 break-words text-3xl">{o.participant}</h3>
                {o.done_at ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-foreground bg-card px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">
                    <CheckCircle2 className="h-3 w-3" aria-hidden /> Concluído
                  </span>
                ) : (
                  alerts.newIds.has(o.order_id) && (
                    <span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary-foreground">
                      {o.edited ? "Alterado" : "Novo"}
                    </span>
                  )
                )}
              </div>
              {o.edited && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
                  <Pencil className="h-3 w-3" aria-hidden /> editado às{" "}
                  {formatSaoPauloTime(o.updated_at)}
                </p>
              )}
              <div className="mt-3 space-y-2">
                {groupByCategory(o.items).map((g) => (
                  <div key={g.category ?? NO_CATEGORY}>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {g.category ?? "Sem categoria"}
                    </p>
                    <ul>
                      {g.items.map((it) => (
                        <li key={it.product_id} className="py-0.5">
                          <div className="flex justify-between gap-2">
                            <span>{it.product}</span>
                            <span className="font-bold">{it.quantity}x</span>
                          </div>
                          {it.note && (
                            <p className="text-xs font-semibold text-primary">Obs.: {it.note}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {o.done_at && Date.parse(o.updated_at) > Date.parse(o.done_at) && (
                <p role="alert" className="mt-3 text-xs font-bold text-destructive">
                  O pedido mudou depois de concluído: confira as alterações e conclua de novo.
                </p>
              )}
              <button
                type="button"
                aria-pressed={!!o.done_at}
                onClick={() => onToggleDone(o.order_id, !o.done_at)}
                className={`pop-press mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-foreground px-4 py-2 text-sm font-bold shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${o.done_at ? "bg-card text-foreground" : "bg-primary text-primary-foreground"}`}
              >
                {o.done_at ? (
                  <>
                    <Undo2 className="h-4 w-4" aria-hidden /> Concluído às{" "}
                    {formatSaoPauloTime(o.done_at)} · desfazer
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Marcar como concluído
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <BoardPrint roundName={board.roundName} orders={orders} generatedAt={board.now} />
      </div>
    </main>
  );
}
