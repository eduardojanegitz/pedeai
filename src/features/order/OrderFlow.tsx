import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Logo } from "@/components/brand/Logo";
import type { MenuProduct } from "@/lib/catalog.functions";
import { formatSaoPauloDay, formatSaoPauloTime } from "@/lib/format";
import { NOTE_MAX } from "@/lib/order-note";
import {
  getLastOrder,
  getMyOrder,
  getMyPayment,
  submitOrder,
  type ActiveRound,
  type MyOrder,
} from "@/lib/orders.functions";
import { FloatingDock } from "./FloatingDock";
import {
  buildSteps,
  canAdd,
  cartLinesForServer,
  counterText,
  invalidSteps,
  limitMessage,
  missingText,
  prefillFromLast,
  selectedLines,
  stepStatus,
  stepTitle,
  totalCents,
  totalItems,
  type Cart,
  type Notes,
  type Step,
} from "./logic";
import { ProductCard } from "./ProductCard";
import { RepeatLastOrder } from "./RepeatLastOrder";
import { RecoveryDialog } from "./RecoveryDialog";
import { Review } from "./Review";
import { StepProgress } from "./StepProgress";
import { SummarySheet } from "./SummarySheet";
import { clearDraft, loadDraft, loadDraftNotes, saveDraft, saveDraftNotes } from "./storage";
import { btnPlain, errMsg } from "./ui";
import type { Menu } from "./types";

type View = { kind: "step"; index: number } | { kind: "review" };
type Fly = { id: number; x: number; y: number; dx: number; dy: number; src: string | null };

export type SavedInfo = { isUpdate: boolean; items: { name: string; quantity: number }[] };

/**
 * Jornada de escolha: uma etapa por categoria, revisão, edição pontual e confirmação.
 * `existing` = o participante já tem pedido confirmado e está editando.
 */
export function OrderFlow({
  round,
  token,
  me,
  menu,
  existing,
  onSaved,
  onExit,
}: {
  round: ActiveRound;
  token: string;
  me: MyOrder;
  menu: Menu;
  existing: boolean;
  onSaved: (info: SavedInfo) => void;
  onExit: () => void;
}) {
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const submit = useServerFn(submitOrder);
  const steps = useMemo(() => buildSteps(menu.categories, menu.products), [menu]);
  const byId = useMemo(
    () => new Map<string, MenuProduct>(menu.products.map((p) => [p.id, p])),
    [menu],
  );

  // Carrinho inicial: pedido confirmado (edição) > rascunho local > itens do último pedido (ex.: cancelado).
  const initial = useMemo(() => {
    const fromServer = me.items.filter((i) => byId.has(i.product_id));
    const unavailable = me.items
      .filter((i) => !byId.has(i.product_id))
      .map((i) => i.product_name ?? "Item removido");
    const draft = existing ? null : loadDraft(round.id, me.participant.id);
    const cart: Cart = draft
      ? Object.fromEntries(Object.entries(draft).filter(([id]) => byId.has(id)))
      : Object.fromEntries(fromServer.map((i) => [i.product_id, i.quantity]));
    const draftNotes = draft ? (loadDraftNotes(round.id, me.participant.id) ?? {}) : null;
    const notes: Notes = Object.fromEntries(
      (draftNotes
        ? Object.entries(draftNotes)
        : fromServer.flatMap((i) => (i.note ? [[i.product_id, i.note] as const] : []))
      ).filter(([id, text]) => id in cart && typeof text === "string"),
    );
    return { cart, notes, unavailable };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só no primeiro render
  }, []);

  const [cart, setCart] = useState<Cart>(initial.cart);
  const [notes, setNotes] = useState<Notes>(initial.notes);
  const [prefill, setPrefill] = useState<{ skipped: string[]; basedOn: string } | null>(null);
  // "O de sempre": só faz sentido para pedido novo (quem está editando já tem o seu).
  const last = useQuery({
    queryKey: ["last-order", token, round.id],
    queryFn: () => getLastOrder({ data: { token, roundId: round.id } }),
    enabled: !existing,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [view, setView] = useState<View>({ kind: "step", index: 0 });
  const [dir, setDir] = useState<1 | -1>(1);
  const [returnToReview, setReturnToReview] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [version, setVersion] = useState(me.version);
  const [flies, setFlies] = useState<Fly[]>([]);
  const bagRef = useRef<HTMLSpanElement>(null);
  const requestId = useRef<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Rascunho local (só pedidos novos) para não perder escolhas ao recarregar.
  useEffect(() => {
    if (!existing) saveDraft(round.id, me.participant.id, cart);
  }, [cart, existing, round.id, me.participant.id]);
  useEffect(() => {
    if (!existing) saveDraftNotes(round.id, me.participant.id, notes);
  }, [notes, existing, round.id, me.participant.id]);

  const currentIndex = view.kind === "review" ? steps.length : view.index;
  const step: Step | undefined = view.kind === "step" ? steps[view.index] : undefined;
  const labels = [...steps.map((s) => s.category.name), "Revisão"];
  const done = labels.map(
    (_, i) => i < steps.length && stepStatus(cart, steps[i]!).satisfied && i < currentIndex,
  );
  const problems = invalidSteps(cart, steps);
  const count = totalItems(cart, steps);
  const total = totalCents(cart, steps);

  const go = (v: View, d: 1 | -1) => {
    setDir(d);
    setHint(null);
    setView(v);
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  const goStep = (i: number) => go({ kind: "step", index: i }, i >= currentIndex ? 1 : -1);
  const editStep = (i: number) => {
    setSheet(false);
    setReturnToReview(true);
    goStep(i);
  };
  const next = () => {
    if (returnToReview) {
      setReturnToReview(false);
      return go({ kind: "review" }, 1);
    }
    if (view.kind === "step" && view.index + 1 < steps.length)
      return go({ kind: "step", index: view.index + 1 }, 1);
    go({ kind: "review" }, 1);
  };
  const back = () => {
    setReturnToReview(false);
    if (view.kind === "review") return go({ kind: "step", index: steps.length - 1 }, -1);
    if (view.index > 0) return go({ kind: "step", index: view.index - 1 }, -1);
    onExit();
  };

  const touch = () => {
    requestId.current = null; // carrinho mudou: um reenvio não pode reaproveitar a chave anterior
  };
  const showHint = (text: string) => {
    setHint(text);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 3500);
  };

  const toggle = (s: Step, p: MenuProduct, el: HTMLElement) => {
    touch();
    if ((cart[p.id] ?? 0) > 0) {
      setCart((c) => {
        const n = { ...c };
        delete n[p.id];
        return n;
      });
      dropNote(p.id);
      return;
    }
    if (!canAdd(cart, s, p.id))
      return showHint(
        `Limite de ${s.category.max_select} atingido. Remova uma escolha para trocar.`,
      );
    setCart((c) => ({ ...c, [p.id]: 1 }));
    const to = bagRef.current?.getBoundingClientRect();
    if (!reduce && to) {
      const from = el.getBoundingClientRect();
      const fx = from.left + from.width / 2;
      const fy = from.top + Math.min(from.height / 2, 90);
      setFlies((f) => [
        ...f,
        {
          id: Date.now() + Math.random(),
          x: fx,
          y: fy,
          dx: to.left + to.width / 2 - fx,
          dy: to.top + to.height / 2 - fy,
          src: p.image_url,
        },
      ]);
    }
  };
  const dropNote = (id: string) =>
    setNotes((n) => {
      if (!(id in n)) return n;
      const rest = { ...n };
      delete rest[id];
      return rest;
    });
  const setNote = (id: string, text: string) => {
    touch();
    setNotes((n) => ({ ...n, [id]: text.slice(0, NOTE_MAX) }));
  };
  const remove = (id: string) => {
    touch();
    dropNote(id);
    setCart((c) => {
      const n = { ...c };
      delete n[id];
      return n;
    });
  };
  const quantity = (id: string, delta: 1 | -1) => {
    touch();
    setCart((c) => ({ ...c, [id]: Math.min(99, Math.max(1, (c[id] ?? 1) + delta)) }));
  };

  const confirm = async (expectedVersion = version) => {
    if (busy) return;
    if (problems.length) {
      toast.error("Revise as categorias marcadas antes de confirmar.");
      return;
    }
    setBusy(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const res = await submit({
        data: {
          token,
          roundId: round.id,
          expectedVersion,
          requestId: requestId.current,
          items: cartLinesForServer(cart, steps, notes),
        },
      });
      if (!res.ok) {
        requestId.current = null;
        if (res.code === "VERSION_CONFLICT") {
          setConflict(true);
          return;
        }
        if (res.code === "ROUND_CLOSED" || res.code === "ROUND_NOT_STARTED")
          void qc.invalidateQueries({ queryKey: ["active-round"] });
        if (res.code === "PRODUCT_UNAVAILABLE") void qc.invalidateQueries({ queryKey: ["menu"] });
        toast.error(res.message);
        return;
      }
      requestId.current = null;
      clearDraft(round.id, me.participant.id);
      // Só avança depois de reler o pedido salvo: a tela nunca mostra sucesso sem confirmação do servidor.
      await qc.invalidateQueries({ queryKey: ["my-order"] });
      // O valor pode ter mudado: busca já, para o Pix estar pronto quando a mensagem de confirmação abrir.
      void qc.prefetchQuery({
        queryKey: ["my-payment", token, round.id],
        queryFn: () => getMyPayment({ data: { token, roundId: round.id } }),
        staleTime: 0,
      });
      onSaved({
        isUpdate: existing,
        items: steps.flatMap((s) =>
          selectedLines(cart, s).map(({ product, quantity }) => ({ name: product.name, quantity })),
        ),
      });
    } catch (e) {
      // Falha de rede: a chave de reenvio é mantida, então tentar de novo não duplica o pedido.
      toast.error(`${errMsg(e)} Suas escolhas continuam aqui; tente confirmar de novo.`);
    } finally {
      setBusy(false);
    }
  };

  const loadLatest = async () => {
    const fresh = await qc.fetchQuery({
      queryKey: ["my-order", token, round.id],
      queryFn: () => getMyOrder({ data: { token, roundId: round.id } }),
      staleTime: 0,
    });
    return fresh;
  };
  const keepMine = async () => {
    setConflict(false);
    const fresh = await loadLatest();
    if (!fresh) {
      toast.error("Não foi possível atualizar. Recarregue a página.");
      return;
    }
    setVersion(fresh.version);
    await confirm(fresh.version);
  };
  const repeatLast = () => {
    if (!last.data) return;
    const r = prefillFromLast(steps, last.data.items);
    if (Object.keys(r.cart).length === 0) {
      toast.error("Nada do seu último pedido está disponível hoje. Escolha pelo cardápio.");
      return;
    }
    touch();
    setCart(r.cart);
    setNotes(r.notes);
    setPrefill({ skipped: r.skipped, basedOn: formatSaoPauloDay(last.data.when) });
    go({ kind: "review" }, 1);
  };
  const showLatest = async () => {
    setConflict(false);
    const fresh = await loadLatest();
    if (!fresh) return;
    setVersion(fresh.version);
    setCart(
      Object.fromEntries(
        fresh.items.filter((i) => byId.has(i.product_id)).map((i) => [i.product_id, i.quantity]),
      ),
    );
    setNotes(
      Object.fromEntries(
        fresh.items.flatMap((i) =>
          byId.has(i.product_id) && i.note ? [[i.product_id, i.note] as const] : [],
        ),
      ),
    );
    touch();
    go({ kind: "review" }, 1);
  };

  const st = step ? stepStatus(cart, step) : null;
  const isLastStep = view.kind === "step" && view.index === steps.length - 1;
  const onReview = view.kind === "review";
  const primary = onReview
    ? {
        label: existing ? "Salvar alterações" : "Confirmar pedido",
        disabled: problems.length > 0,
        onClick: () => void confirm(),
      }
    : {
        label: returnToReview
          ? "Voltar à revisão"
          : st && st.picked === 0 && st.min === 0
            ? "Pular"
            : isLastStep
              ? "Revisar pedido"
              : "Continuar",
        disabled: !st || !st.satisfied || st.over,
        onClick: next,
      };
  const dockHint = onReview
    ? problems.length
      ? "Há categorias para revisar"
      : "Tudo certo para confirmar"
    : st && !st.satisfied
      ? missingText(step!.category, st)
      : st?.over
        ? "Remova uma escolha"
        : st?.full
          ? "Categoria completa!"
          : st
            ? counterText(st)
            : "";

  if (steps.length === 0) {
    return (
      <main className="mx-auto max-w-md px-5 py-20 text-center">
        <Logo className="text-6xl" />
        <h1 className="mt-6 text-4xl">Cardápio em preparação</h1>
        <p className="mt-3 text-muted-foreground">
          Ainda não há itens disponíveis. Volte em instantes!
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-40 pt-5">
      <header className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          aria-label={
            view.kind === "step" && view.index === 0
              ? existing
                ? "Cancelar edição"
                : "Início"
              : "Voltar"
          }
          className={`${btnPlain} min-h-11 px-4 ${view.kind === "step" && view.index === 0 && !existing ? "invisible" : ""}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />{" "}
          {view.kind === "step" && view.index === 0 && existing ? "Cancelar" : "Voltar"}
        </button>
        <Logo className="text-4xl" animate={false} />
        <button
          type="button"
          onClick={() => setRecoveryOpen(true)}
          aria-label="Recuperar pedido em outro aparelho"
          className="grid h-11 w-11 place-items-center rounded-full border-2 border-foreground bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <KeyRound className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <StepProgress labels={labels} current={currentIndex} done={done} onJump={goStep} />

      {round.closes_at && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden /> Pedidos até{" "}
          {formatSaoPauloTime(round.closes_at)}
        </p>
      )}
      {existing && !onReview && (
        <p className="mt-3 rounded-2xl border-2 border-foreground bg-accent px-3 py-2 text-center text-sm font-bold text-accent-foreground">
          Editando seu pedido
        </p>
      )}

      {!existing &&
        last.data &&
        count === 0 &&
        !prefill &&
        view.kind === "step" &&
        view.index === 0 && (
          <div className="mt-6">
            <RepeatLastOrder last={last.data} onUse={repeatLast} />
          </div>
        )}

      <div className="relative mt-6 overflow-x-clip">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={onReview ? "review" : step!.category.id}
            custom={dir}
            initial={reduce ? false : { opacity: 0, x: dir * 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -36 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
          >
            {onReview ? (
              <Review
                steps={steps}
                cart={cart}
                notes={notes}
                participantName={me.participant.display_name}
                isUpdate={existing}
                unavailable={[...initial.unavailable, ...(prefill?.skipped ?? [])]}
                basedOn={prefill?.basedOn}
                onEditStep={editStep}
              />
            ) : (
              step &&
              st && (
                <section aria-label={step.category.name}>
                  <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                    Etapa {view.kind === "step" ? view.index + 1 : 0} de {steps.length + 1}
                  </p>
                  <h1 className="text-5xl text-primary">{stepTitle(step.category)}</h1>
                  {step.category.description && (
                    <p className="mt-1 text-muted-foreground">{step.category.description}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1 text-sm font-bold transition-colors ${st.full ? "bg-secondary text-secondary-foreground" : "bg-card"}`}
                    >
                      {st.full && <CheckCircle2 className="h-4 w-4" aria-hidden />}{" "}
                      {counterText(st)}
                    </span>
                    <AnimatePresence mode="wait" initial={false}>
                      {(hint || st.full) && (
                        <motion.span
                          key={hint ?? "full"}
                          initial={reduce ? false : { opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          role={hint ? "alert" : "status"}
                          className={`text-sm font-bold ${hint ? "text-destructive" : "text-secondary"}`}
                        >
                          {hint ?? limitMessage(step.category)}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>

                  <ul className="mt-5 grid gap-5 sm:grid-cols-2">
                    {step.products.map((p, i) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        index={i}
                        quantity={cart[p.id] ?? 0}
                        note={notes[p.id] ?? ""}
                        onNote={(text) => setNote(p.id, text)}
                        blocked={st.full}
                        allowQuantity={step.category.allow_quantity}
                        onToggle={(el) => toggle(step, p, el)}
                        onBlocked={() =>
                          showHint(
                            `Limite de ${step.category.max_select} atingido. Toque em uma opção escolhida para trocar.`,
                          )
                        }
                        onQuantity={(d) => quantity(p.id, d)}
                      />
                    ))}
                  </ul>
                </section>
              )
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Itens "voando" até o dock (desligado com movimento reduzido) */}
      {flies.map((f) => (
        <motion.div
          key={f.id}
          aria-hidden
          className="pointer-events-none fixed z-50 h-10 w-10 overflow-hidden rounded-full border-2 border-foreground bg-primary"
          style={{ left: f.x - 20, top: f.y - 20 }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{ x: f.dx, y: f.dy, scale: 0.4, opacity: 0.6 }}
          transition={{ duration: 0.55, ease: [0.5, 0, 0.9, 0.4] }}
          onAnimationComplete={() => setFlies((fl) => fl.filter((x) => x.id !== f.id))}
        >
          {f.src && <img src={f.src} alt="" className="h-full w-full object-cover" />}
        </motion.div>
      ))}

      <FloatingDock
        count={count}
        totalCents={total}
        hint={dockHint}
        onOpenSummary={() => setSheet(true)}
        primaryLabel={primary.label}
        primaryDisabled={primary.disabled}
        primaryBusy={busy}
        onPrimary={primary.onClick}
        bagRef={bagRef}
      />
      <SummarySheet
        open={sheet}
        onOpenChange={setSheet}
        steps={steps}
        cart={cart}
        onRemove={remove}
        onEditStep={editStep}
      />
      <RecoveryDialog
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        token={token}
        name={me.participant.display_name}
        hasPhone={me.has_phone}
      />

      <AlertDialog open={conflict} onOpenChange={setConflict}>
        <AlertDialogContent className="rounded-3xl border-2 border-foreground bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-3xl font-normal">
              Pedido alterado em outro aparelho
            </AlertDialogTitle>
            <AlertDialogDescription>
              Seu pedido mudou desde que você começou a editar. Você pode ver a versão mais recente
              (suas alterações aqui serão descartadas) ou manter as suas escolhas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void showLatest()}>
              Ver versão atual
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void keepMine()}>Manter as minhas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
