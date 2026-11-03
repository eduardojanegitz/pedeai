import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, ImagePlus, Minus, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { getCatalog, type CatalogProduct } from "@/lib/catalog.functions";
import {
  cancelOrder,
  getActiveRound,
  getMyOrder,
  registerParticipant,
  submitOrder,
  type Round,
} from "@/lib/orders.functions";
import { getToken, newToken } from "@/lib/participant";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

const catalogQuery = queryOptions({ queryKey: ["catalog"], queryFn: () => getCatalog() });
const roundQuery = queryOptions({
  queryKey: ["active-round"],
  queryFn: () => getActiveRound(),
  refetchInterval: 30_000,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cardápio Digital — Faça seu pedido" },
      { name: "description", content: "Escolha seus itens no cardápio e confirme seu pedido da rodada." },
      { property: "og:title", content: "Cardápio Digital — Faça seu pedido" },
      { property: "og:description", content: "Escolha seus itens no cardápio e confirme seu pedido da rodada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const btn =
  "pop-press inline-flex items-center justify-center gap-2 rounded-full border-2 border-foreground px-5 py-2.5 font-bold shadow-pop disabled:opacity-50";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

function Shell({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
      <motion.div
        aria-hidden
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-secondary"
        initial={reduce ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-20 -left-16 h-56 w-56 rounded-[3rem] bg-accent"
        initial={reduce ? false : { scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 12 }}
        transition={{ type: "spring", stiffness: 100, damping: 12, delay: 0.1 }}
      />
      <motion.section
        className="pop-card relative z-10 w-full max-w-md p-8 text-center"
        initial={reduce ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.1 }}
      >
        {children}
      </motion.section>
    </main>
  );
}

function Index() {
  const round = useQuery(roundQuery);
  if (round.isPending) {
    return (
      <Shell>
        <div className="h-40 animate-pulse rounded-2xl bg-muted" aria-label="Carregando" />
      </Shell>
    );
  }
  if (round.isError) {
    return (
      <Shell>
        <h1 className="text-5xl text-primary">Ops!</h1>
        <p className="mt-4 text-muted-foreground">Não foi possível carregar o cardápio.</p>
        <button className={`${btn} mt-6 bg-primary text-primary-foreground`} onClick={() => round.refetch()}>
          Tentar de novo
        </button>
      </Shell>
    );
  }
  if (!round.data) {
    return (
      <Shell>
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Bem-vindo ao</p>
        <h1 className="mt-2 text-7xl text-primary">Cardápio</h1>
        <p className="mt-8 text-base text-muted-foreground">
          Nenhuma rodada de pedidos aberta no momento. Volte em breve!
        </p>
      </Shell>
    );
  }
  return <Participant round={round.data} />;
}

// Identificação: token secreto no aparelho; o servidor guarda só o hash.
function Participant({ round }: { round: Round }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => setToken(getToken()), []);
  const me = useQuery({
    queryKey: ["my-order", token, round.id],
    queryFn: () => getMyOrder({ data: { token: token!, roundId: round.id } }),
    enabled: !!token,
  });

  if (token === undefined || (token && me.isPending)) {
    return (
      <Shell>
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </Shell>
    );
  }
  if (!token || !me.data || me.isError) {
    return (
      <NameGate
        roundName={round.name}
        onDone={(t) => {
          setToken(t);
        }}
      />
    );
  }
  return <Menu key={me.data.participant.id} round={round} token={token} me={me.data} />;
}

function NameGate({
  roundName,
  onDone,
}: {
  roundName: string;
  onDone: (t: string) => void;
}) {
  const register = useServerFn(registerParticipant);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Também cobre código antigo que o servidor não reconhece mais: gera um novo.
      const t = newToken();
      await register({ data: { name, token: t } });
      onDone(t);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{roundName}</p>
      <h1 className="mt-2 text-6xl text-primary">Quem é você?</h1>
      <p className="mt-3 text-muted-foreground">
        Digite seu nome para fazer o pedido. Este aparelho vai lembrar de você.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <label htmlFor="who" className="sr-only">Seu nome</label>
        <input
          id="who"
          autoFocus
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
          className="w-full rounded-full border-2 border-foreground bg-card px-5 py-3 text-center text-lg outline-none focus:ring-2 focus:ring-ring"
        />
        <button disabled={busy || !name.trim()} className={`${btn} w-full bg-primary text-primary-foreground`}>
          {busy ? "Entrando…" : "Ver cardápio"}
        </button>
      </form>
    </Shell>
  );
}

type Cart = Record<string, number>;

function Menu({
  round,
  token,
  me,
}: {
  round: Round;
  token: string;
  me: NonNullable<Awaited<ReturnType<typeof getMyOrder>>>;
}) {
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const catalog = useQuery(catalogQuery);
  const submit = useServerFn(submitOrder);
  const cancel = useServerFn(cancelOrder);

  const confirmed = me.status === "confirmed";
  const [cart, setCart] = useState<Cart>(() => Object.fromEntries(me.items.map((i) => [i.product_id, i.quantity])));
  const [editing, setEditing] = useState(!confirmed);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [active, setActive] = useState<string>("all");
  const [bump, setBump] = useState(0);
  const cartBtn = useRef<HTMLButtonElement>(null);
  const [flies, setFlies] = useState<{ id: number; x: number; y: number; dx: number; dy: number; src: string | null }[]>([]);

  const products = catalog.data?.products ?? [];
  const categories = catalog.data?.categories ?? [];
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const visible = active === "all" ? products : products.filter((p) => p.category_id === active);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && byId.has(id));

  const refreshMine = () => qc.invalidateQueries({ queryKey: ["my-order"] });

  const setQty = (id: string, q: number) =>
    setCart((c) => {
      const n = { ...c };
      if (q <= 0) delete n[id];
      else n[id] = Math.min(99, q);
      return n;
    });

  const add = (p: CatalogProduct, el: HTMLElement) => {
    setQty(p.id, (cart[p.id] ?? 0) + 1);
    setBump((b) => b + 1);
    const to = cartBtn.current?.getBoundingClientRect();
    if (!reduce && to) {
      const from = el.getBoundingClientRect();
      const id = Date.now() + Math.random();
      setFlies((f) => [
        ...f,
        {
          id,
          x: from.left + from.width / 2,
          y: from.top + from.height / 2,
          dx: to.left + to.width / 2 - (from.left + from.width / 2),
          dy: to.top + to.height / 2 - (from.top + from.height / 2),
          src: p.image_url,
        },
      ]);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await submit({
        data: { token, roundId: round.id, items: lines.map(([product_id, quantity]) => ({ product_id, quantity })) },
      });
      setOpen(false);
      setEditing(false);
      setCelebrate(true);
      refreshMine();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!window.confirm("Cancelar seu pedido?")) return;
    setBusy(true);
    try {
      await cancel({ data: { token, roundId: round.id } });
      setCart({});
      setEditing(true);
      toast.success("Pedido cancelado");
      refreshMine();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // Resumo do pedido já confirmado
  if (confirmed && !editing) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <Celebrate show={celebrate} onDone={() => setCelebrate(false)} />
        <div className="pop-card bg-accent p-6 text-accent-foreground">
          <p className="text-sm font-bold uppercase tracking-widest">{round.name}</p>
          <h1 className="text-6xl">Pedido confirmado, {me.participant.display_name}!</h1>
        </div>
        <ul className="pop-card mt-6 divide-y-2 divide-foreground/10 overflow-hidden">
          {lines.map(([id, q]) => (
            <li key={id} className="flex justify-between px-4 py-3">
              <span>{byId.get(id)?.name}</span>
              <span className="font-bold">{q}x</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">Você pode editar ou cancelar até o fim da rodada.</p>
        <div className="mt-4 flex gap-2">
          <button className={`${btn} bg-primary text-primary-foreground`} onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </button>
          <button disabled={busy} className={`${btn} bg-card`} onClick={doCancel}>
            <Trash2 className="h-4 w-4" /> Cancelar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-32 pt-6">
      <header className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {round.name} · {me.participant.display_name}
        </p>
        <h1 className="text-6xl text-primary">Cardápio</h1>
      </header>

      <nav aria-label="Categorias" className="sticky top-0 z-20 -mx-4 mb-6 flex gap-2 overflow-x-auto bg-background/95 px-4 py-3 backdrop-blur">
        {[{ id: "all", name: "Tudo" }, ...categories].map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            aria-pressed={active === c.id}
            className={`relative shrink-0 rounded-full border-2 border-foreground px-4 py-1.5 text-sm font-bold ${active === c.id ? "text-primary-foreground" : "bg-card"}`}
          >
            {active === c.id && (
              <motion.span layoutId="menu-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
            )}
            <span className="relative">{c.name}</span>
          </button>
        ))}
      </nav>

      {catalog.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="pop-card p-10 text-center">
          <h2 className="text-4xl">Nada por aqui</h2>
          <p className="mt-2 text-muted-foreground">Nenhum item nesta categoria.</p>
        </div>
      ) : (
        <motion.ul layout className="grid gap-5 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {visible.map((p, i) => {
              const q = cart[p.id] ?? 0;
              return (
                <motion.li
                  key={p.id}
                  layout
                  initial={reduce ? false : { opacity: 0, y: 20, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 220, damping: 22, delay: Math.min(i * 0.04, 0.3) }}
                  className="pop-card overflow-hidden"
                >
                  <div className="aspect-[4/3] border-b-2 border-foreground bg-muted">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImagePlus className="h-10 w-10" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-3xl">{p.name}</h3>
                    {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
                    <div className="mt-4 flex items-center justify-end gap-2">
                      {q > 0 && (
                        <>
                          <button aria-label={`Remover um ${p.name}`} className="pop-press grid h-10 w-10 place-items-center rounded-full border-2 border-foreground bg-card" onClick={() => setQty(p.id, q - 1)}>
                            <Minus className="h-4 w-4" />
                          </button>
                          <span aria-live="polite" className="w-8 text-center text-xl font-bold">{q}</span>
                        </>
                      )}
                      <button
                        aria-label={`Adicionar ${p.name}`}
                        className="pop-press grid h-10 w-10 place-items-center rounded-full border-2 border-foreground bg-primary text-primary-foreground shadow-pop"
                        onClick={(e) => add(p, e.currentTarget)}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}

      {/* Itens "voando" até o carrinho */}
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

      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4"
          >
            <motion.button
              ref={cartBtn}
              key={bump}
              animate={{ scale: reduce ? 1 : [1, 1.08, 1] }}
              transition={{ duration: 0.3 }}
              onClick={() => setOpen(true)}
              className="pop-press flex w-full max-w-md items-center justify-between rounded-full border-2 border-foreground bg-secondary px-6 py-4 text-secondary-foreground shadow-pop-lg"
            >
              <span className="flex items-center gap-2 font-bold"><ShoppingBag className="h-5 w-5" /> Ver meu pedido</span>
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-accent px-2 font-bold text-accent-foreground">{count}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="border-2 border-foreground bg-background">
          <div className="mx-auto w-full max-w-md px-4 pb-6">
            <DrawerHeader className="px-0">
              <DrawerTitle className="font-display text-4xl font-normal">Seu pedido</DrawerTitle>
              <DrawerDescription>Confira os itens antes de confirmar.</DrawerDescription>
            </DrawerHeader>
            <ul className="max-h-[45vh] space-y-2 overflow-y-auto">
              {lines.map(([id, q]) => (
                <li key={id} className="flex items-center justify-between gap-2 rounded-2xl border-2 border-foreground bg-card px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{byId.get(id)?.name}</span>
                  <button aria-label="Menos" className="grid h-8 w-8 place-items-center rounded-full border-2 border-foreground" onClick={() => setQty(id, q - 1)}><Minus className="h-3 w-3" /></button>
                  <span className="w-6 text-center font-bold">{q}</span>
                  <button aria-label="Mais" className="grid h-8 w-8 place-items-center rounded-full border-2 border-foreground" onClick={() => setQty(id, q + 1)}><Plus className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
            <button disabled={busy || lines.length === 0} onClick={confirm} className={`${btn} mt-5 w-full bg-primary text-primary-foreground`}>
              {busy ? "Enviando…" : confirmed ? "Salvar alterações" : "Confirmar pedido"}
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

function Celebrate({ show, onDone }: { show: boolean; onDone: () => void }) {
  const reduce = useReducedMotion();
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => done.current(), 1800);
    return () => clearTimeout(t);
  }, [show]);
  const colors = ["bg-primary", "bg-secondary", "bg-accent", "bg-foreground"];
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
            className="grid h-28 w-28 place-items-center rounded-full border-2 border-foreground bg-primary text-primary-foreground shadow-pop-lg"
          >
            <Check className="h-14 w-14" strokeWidth={3} />
            <span className="sr-only">Pedido confirmado</span>
          </motion.div>
          {!reduce &&
            Array.from({ length: 18 }).map((_, i) => {
              const a = (i / 18) * Math.PI * 2;
              return (
                <motion.span
                  key={i}
                  aria-hidden
                  className={`absolute h-3 w-3 rounded-sm ${colors[i % 4]}`}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: Math.cos(a) * 140, y: Math.sin(a) * 140, opacity: 0, rotate: 180 }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                />
              );
            })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
