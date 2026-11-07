import { motion, useReducedMotion } from "motion/react";
import { History } from "lucide-react";
import { formatSaoPauloDay } from "@/lib/format";
import type { LastOrder } from "@/lib/last-order";
import { btnPrimary } from "./ui";

/** Faixa "Pedir o de sempre": repete o último pedido em um toque (o participante ainda revisa antes de confirmar). */
export function RepeatLastOrder({ last, onUse }: { last: LastOrder; onUse: () => void }) {
  const reduce = useReducedMotion();
  const names = last.items.map((i) => i.product_name ?? "Item removido");
  const shown = names.slice(0, 4).join(" · ");
  const more = names.length > 4 ? ` + ${names.length - 4}` : "";
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label="Pedir o de sempre"
      className="pop-card mb-5 flex flex-wrap items-center justify-between gap-3 bg-secondary p-4 text-secondary-foreground"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-widest">
          <History className="h-4 w-4" aria-hidden /> Pedir o de sempre
        </p>
        <p className="mt-1 break-words text-sm font-semibold">
          {shown}
          {more}
        </p>
        <p className="text-xs">Seu pedido de {formatSaoPauloDay(last.when)}</p>
      </div>
      <button type="button" className={btnPrimary} onClick={onUse}>
        Usar este pedido
      </button>
    </motion.section>
  );
}
