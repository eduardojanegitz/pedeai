import { useQuery } from "@tanstack/react-query";
import { getMyPayment, type MyPayment } from "@/lib/orders.functions";

/** O participante ainda precisa pagar? (há valor e Pix configurado, e o organizador não marcou pago) */
export const paymentDue = (p: MyPayment | undefined) => p?.state === "pay";

/** Pagamento Pix do pedido (atualiza sozinho para pegar o "pago" marcado pelo organizador). */
export function useMyPayment(token: string, roundId: string) {
  return useQuery({
    queryKey: ["my-payment", token, roundId],
    queryFn: () => getMyPayment({ data: { token, roundId } }),
    refetchInterval: 15_000,
    retry: false,
  });
}
