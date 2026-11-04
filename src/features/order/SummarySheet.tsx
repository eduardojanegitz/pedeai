import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pencil, ShoppingBag, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { formatBRL } from "@/lib/format";
import { selectedLines, stepStatus, totalCents, type Cart, type Step } from "./logic";

/** Painel (bottom sheet) com o pedido atual agrupado por categoria. Abre a partir do dock. */
export function SummarySheet({
  open,
  onOpenChange,
  steps,
  cart,
  onRemove,
  onEditStep,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  steps: Step[];
  cart: Cart;
  onRemove: (productId: string) => void;
  onEditStep: (index: number) => void;
}) {
  const reduce = useReducedMotion();
  const total = totalCents(cart, steps);
  const empty = steps.every((s) => selectedLines(cart, s).length === 0);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="border-2 border-foreground bg-background">
        <div className="mx-auto w-full max-w-md px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0">
            <DrawerTitle className="font-display text-4xl font-normal">Seu pedido</DrawerTitle>
            <DrawerDescription>Veja, troque ou remova suas escolhas.</DrawerDescription>
          </DrawerHeader>

          {empty ? (
            <div className="grid place-items-center gap-2 py-8 text-center text-muted-foreground">
              <ShoppingBag className="h-10 w-10" aria-hidden />
              <p className="font-semibold">Você ainda não escolheu nada.</p>
            </div>
          ) : (
            <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
              {steps.map((step, i) => {
                const lines = selectedLines(cart, step);
                const st = stepStatus(cart, step);
                return (
                  <section key={step.category.id} aria-label={step.category.name}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <h3 className="text-2xl">{step.category.name}</h3>
                      <button
                        type="button"
                        onClick={() => onEditStep(i)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm font-bold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                      </button>
                    </div>
                    {lines.length === 0 ? (
                      <p className="rounded-2xl border-2 border-dashed border-foreground/30 px-3 py-2 text-sm text-muted-foreground">
                        {st.min > 0 ? "Ainda falta escolher." : "Nada escolhido (opcional)."}
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        <AnimatePresence initial={false}>
                          {lines.map(({ product, quantity }) => (
                            <motion.li
                              key={product.id}
                              layout={!reduce}
                              initial={reduce ? false : { opacity: 0, x: -12 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex items-center gap-2 rounded-2xl border-2 border-foreground bg-card px-3 py-2"
                            >
                              <span className="min-w-0 flex-1 truncate font-semibold">
                                {quantity > 1 && (
                                  <span className="mr-1 text-primary">{quantity}×</span>
                                )}
                                {product.name}
                              </span>
                              {product.price_cents != null && (
                                <span className="text-sm text-muted-foreground">
                                  {formatBRL(product.price_cents * quantity)}
                                </span>
                              )}
                              <button
                                type="button"
                                aria-label={`Remover ${product.name}`}
                                onClick={() => onRemove(product.id)}
                                className="grid h-9 w-9 place-items-center rounded-full border-2 border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </motion.li>
                          ))}
                        </AnimatePresence>
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {total != null && !empty && (
            <p className="mt-4 flex items-center justify-between border-t-2 border-foreground pt-3 text-lg font-bold">
              <span>Total</span>
              <span>{formatBRL(total)}</span>
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
