import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

type Props = {
  /** Nomes das etapas, incluindo "Revisão" no final. */
  labels: string[];
  current: number;
  /** Etapas já concluídas (podem ser revisitadas). */
  done: boolean[];
  onJump: (index: number) => void;
};

/**
 * Progresso compacto: bolinhas ligadas por uma barra que preenche. No celular só o rótulo da etapa atual
 * aparece (economiza espaço); em telas maiores todos os rótulos ficam visíveis.
 */
export function StepProgress({ labels, current, done, onJump }: Props) {
  const reduce = useReducedMotion();
  return (
    <nav aria-label="Progresso do pedido">
      <ol className="flex items-start">
        {labels.map((label, i) => {
          const isCurrent = i === current;
          const isDone = done[i] === true && !isCurrent;
          const clickable = (isDone || isCurrent) && !isCurrent;
          const last = i === labels.length - 1;
          return (
            <li
              key={`${i}-${label}`}
              className={`flex items-start ${last ? "" : "flex-1"}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onJump(i)}
                className="group flex min-w-11 flex-col items-center gap-1 focus-visible:outline-none"
                aria-label={`${label}${isDone ? " (concluída)" : isCurrent ? " (etapa atual)" : ""}`}
              >
                <motion.span
                  animate={{ scale: isCurrent && !reduce ? 1.12 : 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 20 }}
                  className={`grid h-9 w-9 place-items-center rounded-full border-2 border-foreground text-sm font-bold group-focus-visible:ring-2 group-focus-visible:ring-ring ${
                    isDone
                      ? "bg-secondary text-secondary-foreground"
                      : isCurrent
                        ? "bg-primary text-primary-foreground shadow-pop"
                        : "bg-card text-muted-foreground"
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </motion.span>
                <span
                  className={`max-w-[7.5rem] truncate text-xs font-bold ${isCurrent ? "block" : "hidden sm:block"} ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {label}
                </span>
              </button>
              {!last && (
                <span
                  aria-hidden
                  className="mx-1 mt-[1.05rem] h-1 flex-1 overflow-hidden rounded-full bg-muted"
                >
                  <motion.span
                    className="block h-full origin-left rounded-full bg-secondary"
                    initial={false}
                    animate={{ scaleX: i < current || isDone ? 1 : 0 }}
                    transition={
                      reduce ? { duration: 0 } : { type: "spring", stiffness: 160, damping: 22 }
                    }
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
