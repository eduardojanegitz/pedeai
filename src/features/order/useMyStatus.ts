import { useQuery } from "@tanstack/react-query";
import { getMyStatus } from "@/lib/orders.functions";

/** Status do pedido (recebido / em preparo / pronto); atualiza sozinho a cada poucos segundos. */
export function useMyStatus(token: string, roundId: string) {
  return useQuery({
    queryKey: ["my-status", token, roundId],
    queryFn: () => getMyStatus({ data: { token, roundId } }),
    refetchInterval: 8_000,
    retry: false,
  });
}
