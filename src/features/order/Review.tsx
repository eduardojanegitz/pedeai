import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Pencil, User } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { invalidSteps, selectedLines, stepStatus, totalCents, type Cart, type Step } from "./logic";

/** Revisão final: pedido agrupado por categoria, com "Editar" em cada uma e validação das regras. */
export function Review({
  steps,
  cart,
  participantName,
  isUpdate,
  unavailable,
  onEditStep,
}: {
  steps: Step[];
  cart: Cart;
  participantName: string;
  isUpdate: boolean;
  /** Itens do pedido anterior que não estão mais disponíveis. */
  unavailable: string[];
  onEditStep: (index: number) => void;
}) {
  const reduce = useReducedMotion();
  const problems = invalidSteps(cart, steps);
  const total = totalCents(cart, steps);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Última etapa
      </p>
      <h1 className="text-5xl text-primary">{isUpdate ? "Revise as alterações" : "Seu pedido"}</h1>
      <p className="mt-2 flex items-center gap-2 text-muted-foreground">
        <User className="h-4 w-4" aria-hidden /> Pedido de{" "}
        <strong className="text-foreground">{participantName}</strong>
      </p>

      {unavailable.length > 0 && (
        <div
          role="alert"
          className="mt-4 flex gap-3 rounded-2xl border-2 border-foreground bg-accent p-4 text-accent-foreground"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="text-sm font-medium">
            {unavailable.length === 1
              ? "Um item do seu pedido anterior não está mais disponível"
              : "Alguns itens do seu pedido anterior não estão mais disponíveis"}
            : <strong>{unavailable.join(", ")}</strong>. Escolha outra opção para continuar.
          </p>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {steps.map((step, i) => {
          const lines = selectedLines(cart, step);
          const st = stepStatus(cart, step);
          const problem = problems.find((p) => p.step.category.id === step.category.id);
          return (
            <motion.section
              key={step.category.id}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(i * 0.07, 0.3),
                type: "spring",
                stiffness: 240,
                damping: 24,
              }}
              aria-label={step.category.name}
              className={`pop-card p-4 ${problem ? "border-destructive" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h2 className="min-w-0 text-3xl">{step.category.name}</h2>
                <button
                  type="button"
                  onClick={() => onEditStep(i)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-foreground bg-card px-3.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Pencil className="h-4 w-4" aria-hidden /> Editar{" "}
                  {step.category.name.toLocaleLowerCase("pt-BR")}
                </button>
              </div>

              {lines.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {st.min > 0 ? "Nada escolhido ainda." : "Nada escolhido (opcional)."}
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {lines.map(({ product, quantity }) => (
                    <li key={product.id} className="flex items-center gap-3">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-14 w-14 shrink-0 rounded-xl border-2 border-foreground object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border-2 border-foreground bg-accent font-display text-2xl"
                        >
                          {product.name.trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{product.name}</span>
                        {product.description && (
                          <span className="block truncate text-sm text-muted-foreground">
                            {product.description}
                          </span>
                        )}
                      </span>
                      <span className="text-right text-sm">
                        {quantity > 1 && <span className="block font-bold">{quantity}×</span>}
                        {product.price_cents != null && (
                          <span className="text-muted-foreground">
                            {formatBRL(product.price_cents * quantity)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {problem && (
                <p
                  role="alert"
                  className="mt-3 flex items-center gap-2 text-sm font-bold text-destructive"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  {problem.reason === "min"
                    ? `Escolha pelo menos ${st.min} em ${step.category.name}.`
                    : `Escolha no máximo ${st.max} em ${step.category.name}.`}
                </p>
              )}
            </motion.section>
          );
        })}
      </div>

      {total != null && (
        <p className="mt-5 flex items-center justify-between rounded-2xl border-2 border-foreground bg-secondary px-4 py-3 text-lg font-bold text-secondary-foreground">
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </p>
      )}
    </div>
  );
}
