import { useEffect } from "react";
import { PixPaymentView } from "./PixPayment";
import { paymentDue, useMyPayment } from "./useMyPayment";

/**
 * Pagamento Pix dentro da mensagem de confirmação do pedido. Avisa (`onSettled`) assim que sabe se há
 * pagamento a fazer, para a tela não fechar sozinha antes do participante ver o Pix.
 */
export function PixInSuccess({
  token,
  roundId,
  onSettled,
}: {
  token: string;
  roundId: string;
  onSettled: (due: boolean) => void;
}) {
  const q = useMyPayment(token, roundId);
  const settled = !q.isPending;
  const due = paymentDue(q.data);
  useEffect(() => {
    if (settled) onSettled(due);
  }, [settled, due, onSettled]);
  return <PixPaymentView payment={q.data} compact />;
}
