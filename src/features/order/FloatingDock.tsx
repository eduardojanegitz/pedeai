import { motion, useReducedMotion } from "motion/react";
import { ChevronUp, Loader2 } from "lucide-react";
import { BagBadge } from "@/components/brand/BagBadge";
import type { Ref } from "react";
import { formatBRL } from "@/lib/format";
import { btnPrimary } from "./ui";

type Props = {
  count: number;
  totalCents: number | null;
  /** Texto de apoio abaixo do total (ex.: "Faltam 1 em Acompanhamentos"). */
  hint: string;
  onOpenSummary: () => void;
  primaryLabel: string;
  primaryDisabled: boolean;
  primaryBusy?: boolean;
  onPrimary: () => void;
  bagRef: Ref<HTMLSpanElement>;
};

/**
 * Dock único, fixo na base: à esquerda o resumo (abre o painel com o pedido), à direita a ação principal.
 * O mesmo componente atende todas as etapas, evitando duas barras fixas competindo no celular.
 */
export function FloatingDock({
  count,
  totalCents,
  hint,
  onOpenSummary,
  primaryLabel,
  primaryDisabled,
  primaryBusy,
  onPrimary,
  bagRef,
}: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="pop-card relative mx-auto flex max-w-xl items-center gap-2 overflow-hidden rounded-[1.75rem] bg-card p-2 shadow-pop-lg">
        {primaryBusy && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-muted">
            <motion.span
              className="block h-full w-1/3 rounded-full bg-primary"
              animate={reduce ? { opacity: [0.4, 1, 0.4] } : { x: ["-100%", "300%"] }}
              transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
            />
          </span>
        )}
        <button
          type="button"
          onClick={onOpenSummary}
          aria-label={`Abrir resumo do pedido: ${count} ${count === 1 ? "item" : "itens"}`}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-full px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BagBadge ref={bagRef} size={44}>
            <motion.span
              key={count}
              initial={reduce ? false : { scale: 1.6 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 16 }}
              className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full border-2 border-foreground bg-primary px-1 text-xs font-bold text-primary-foreground"
            >
              {count}
            </motion.span>
          </BagBadge>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-bold">
              {totalCents != null ? formatBRL(totalCents) : "Meu pedido"}
              <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
            </span>
            <span className="block truncate text-xs text-muted-foreground">{hint}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled || primaryBusy}
          className={`${btnPrimary} shrink-0`}
        >
          {primaryBusy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
          {primaryBusy ? "Enviando…" : primaryLabel}
        </button>
      </div>
    </motion.div>
  );
}
