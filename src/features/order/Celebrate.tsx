import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";

/** Confirmação provisória (check + confete). A animação de marca PedeAí! a substitui no bloco 5. */
export function Celebrate({
  show,
  update,
  onDone,
}: {
  show: boolean;
  update: boolean;
  onDone: () => void;
}) {
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
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/70"
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
            <span className="sr-only">{update ? "Pedido atualizado" : "Pedido confirmado"}</span>
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
