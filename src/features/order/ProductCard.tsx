import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Lock, Minus, Plus } from "lucide-react";
import type { MenuProduct } from "@/lib/catalog.functions";
import { formatBRL } from "@/lib/format";

type Props = {
  product: MenuProduct;
  quantity: number;
  /** Categoria completa e este produto não está escolhido. */
  blocked: boolean;
  allowQuantity: boolean;
  index: number;
  onToggle: (el: HTMLElement) => void;
  onBlocked: () => void;
  onQuantity: (delta: 1 | -1) => void;
};

/** Card de produto: o card inteiro é o alvo de toque; seleção = borda + ícone + selo (não só cor). */
export function ProductCard({
  product,
  quantity,
  blocked,
  allowQuantity,
  index,
  onToggle,
  onBlocked,
  onQuantity,
}: Props) {
  const reduce = useReducedMotion();
  const selected = quantity > 0;
  const locked = blocked && !selected;

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 24,
        delay: Math.min(index * 0.05, 0.3),
      }}
    >
      <motion.div
        whileTap={{ scale: reduce || locked ? 1 : 0.98 }}
        className={`pop-card overflow-hidden transition-[box-shadow,background-color,border-color] duration-200 ${
          selected ? "border-primary bg-primary/5 ring-4 ring-primary/30" : ""
        } ${locked ? "opacity-60" : ""}`}
      >
        <button
          type="button"
          aria-pressed={selected}
          aria-disabled={locked}
          onClick={(e) => (locked ? onBlocked() : onToggle(e.currentTarget))}
          className="block w-full text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
        >
          <div className="relative aspect-[16/10] overflow-hidden sm:aspect-[4/3] border-b-2 border-foreground bg-muted">
            {product.image_url ? (
              <motion.img
                src={product.image_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                animate={{ scale: selected && !reduce ? 1.07 : 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 22 }}
              />
            ) : (
              <div
                aria-hidden
                className="grid h-full w-full place-items-center bg-accent font-display text-7xl text-accent-foreground/60"
              >
                {product.name.trim().charAt(0).toUpperCase()}
              </div>
            )}
            <AnimatePresence>
              {selected && (
                <motion.span
                  aria-hidden
                  initial={reduce ? false : { scale: 0, rotate: -40 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border-2 border-foreground bg-primary text-primary-foreground shadow-pop"
                >
                  <Check className="h-5 w-5" strokeWidth={3} />
                </motion.span>
              )}
            </AnimatePresence>
            {locked && (
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border-2 border-foreground bg-card px-2.5 py-1 text-xs font-bold">
                <Lock className="h-3 w-3" aria-hidden /> Limite atingido
              </span>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-3xl">{product.name}</h3>
              {product.price_cents != null && (
                <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">
                  {formatBRL(product.price_cents)}
                </span>
              )}
            </div>
            {product.description && (
              <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
            )}
            <p
              className={`mt-3 inline-flex items-center gap-1.5 text-sm font-bold ${selected ? "text-primary" : "text-muted-foreground"}`}
            >
              {selected ? (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Escolhido · toque para remover
                </>
              ) : locked ? (
                "Remova uma escolha para trocar"
              ) : (
                "Toque para escolher"
              )}
            </p>
          </div>
        </button>

        {allowQuantity && selected && (
          <div className="flex items-center justify-between border-t-2 border-foreground/15 px-4 py-3">
            <span className="text-sm font-semibold">Quantidade</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Diminuir quantidade de ${product.name}`}
                disabled={quantity <= 1}
                onClick={() => onQuantity(-1)}
                className="grid h-11 w-11 place-items-center rounded-full border-2 border-foreground bg-card disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span aria-live="polite" className="w-8 text-center text-xl font-bold tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                aria-label={`Aumentar quantidade de ${product.name}`}
                disabled={quantity >= 99}
                onClick={() => onQuantity(1)}
                className="grid h-11 w-11 place-items-center rounded-full border-2 border-foreground bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.li>
  );
}
