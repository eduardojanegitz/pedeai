import { ShoppingBag } from "lucide-react";
import type { ReactNode, Ref } from "react";

/**
 * A "sacola" da marca: círculo amarelo com borda, usado no dock do pedido e na animação de conclusão,
 * para que a navegação e o final do pedido tenham a mesma identidade.
 */
export function BagBadge({
  size = 44,
  ref,
  children,
  className = "",
}: {
  size?: number;
  ref?: Ref<HTMLSpanElement>;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      ref={ref}
      style={{ width: size, height: size }}
      className={`relative grid shrink-0 place-items-center rounded-full border-2 border-foreground bg-accent text-accent-foreground ${className}`}
    >
      <ShoppingBag style={{ width: size * 0.46, height: size * 0.46 }} aria-hidden />
      {children}
    </span>
  );
}
