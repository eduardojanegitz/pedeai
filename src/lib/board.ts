import type { RoundOrder } from "@/lib/orders.functions";
import type { RoundState } from "@/lib/orders.functions";

/** Pedido como o estabelecimento vê: sem celular, sem preço e sem pagamento. */
export type BoardOrder = {
  id: string;
  /** Primeiro nome + inicial do sobrenome ("João S."). */
  name: string;
  version: number;
  status: "confirmed" | "cancelled";
  created_at: string;
  updated_at: string;
  /** Quando o estabelecimento marcou como concluído (null = pendente). */
  done_at: string | null;
  items: {
    product_id: string;
    product: string;
    category: string | null;
    category_position: number;
    quantity: number;
    note: string | null;
  }[];
};

export type SharedBoard = {
  roundName: string;
  state: RoundState;
  closesAt: string | null;
  /** Horário do servidor ao montar a resposta (ISO). */
  now: string;
  orders: BoardOrder[];
};

export type SharedBoardResult =
  | { status: "ok"; board: SharedBoard }
  | { status: "invalid" | "expired" | "revoked" | "rate_limited" };

/** Formato do token do link: 256 bits em base64url (43 caracteres); aceita um pouco mais de folga. */
export const isBoardToken = (t: string) => /^[A-Za-z0-9_-]{40,64}$/.test(t);

/** "João da Silva Pereira" → "João P." (o estabelecimento não precisa do nome completo). */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Cliente";
  if (parts.length === 1) return parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${parts[0]} ${last.charAt(0).toLocaleUpperCase("pt-BR")}.`;
}

/** Pedidos confirmados no formato que a comanda (folha de impressão) e o consolidado já entendem. */
export function boardToRoundOrders(orders: BoardOrder[]): RoundOrder[] {
  return orders
    .filter((o) => o.status === "confirmed")
    .map((o) => ({
      order_id: o.id,
      participant_id: o.id,
      participant: o.name,
      phone: null,
      created_at: o.created_at,
      updated_at: o.updated_at,
      edited: o.version > 1,
      paid_at: null,
      done_at: o.done_at,
      items: o.items.map((i) => ({ ...i, price_cents: null })),
    }));
}

/** Linhas para detectar novidades entre duas consultas (mesma regra dos alertas do painel). */
export function boardPulse(orders: BoardOrder[]) {
  return orders.map((o) => ({ id: o.id, version: o.version, status: o.status, name: o.name }));
}
