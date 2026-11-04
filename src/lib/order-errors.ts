export type OrderErrorCode =
  | "PARTICIPANT_NOT_FOUND"
  | "ROUND_NOT_FOUND"
  | "ROUND_NOT_STARTED"
  | "ROUND_CLOSED"
  | "INVALID_ITEMS"
  | "PRODUCT_UNAVAILABLE"
  | "QUANTITY_NOT_ALLOWED"
  | "CATEGORY_MIN"
  | "CATEGORY_MAX"
  | "VERSION_CONFLICT"
  | "RATE_LIMITED"
  | "UNKNOWN";

const KNOWN: OrderErrorCode[] = [
  "PARTICIPANT_NOT_FOUND",
  "ROUND_NOT_FOUND",
  "ROUND_NOT_STARTED",
  "ROUND_CLOSED",
  "INVALID_ITEMS",
  "PRODUCT_UNAVAILABLE",
  "QUANTITY_NOT_ALLOWED",
  "CATEGORY_MIN",
  "CATEGORY_MAX",
  "VERSION_CONFLICT",
];

export const RATE_LIMITED_MESSAGE = "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.";

/** Traduz o erro da função `submit_order` (MESSAGE = código, DETAIL = nome) para texto amigável. */
export function mapOrderError(
  message: string | undefined,
  detail?: string | null,
): { code: OrderErrorCode; message: string } {
  const code = KNOWN.find((c) => message?.includes(c)) ?? "UNKNOWN";
  const d = detail ?? "";
  const texts: Record<OrderErrorCode, string> = {
    PARTICIPANT_NOT_FOUND: "Não reconhecemos este aparelho. Recarregue a página e entre novamente.",
    ROUND_NOT_FOUND: "Esta rodada não existe mais.",
    ROUND_NOT_STARTED: "O cardápio ainda não abriu para pedidos.",
    ROUND_CLOSED: "Os pedidos já foram encerrados.",
    INVALID_ITEMS: "Há itens inválidos no pedido. Revise e tente de novo.",
    PRODUCT_UNAVAILABLE: d ? `“${d}” não está mais disponível. Escolha outra opção.` : "Um dos itens não está mais disponível.",
    QUANTITY_NOT_ALLOWED: d ? `Em ${d}, escolha apenas 1 unidade de cada opção.` : "Escolha apenas 1 unidade de cada opção.",
    CATEGORY_MIN: d ? `Escolha mais itens em ${d}.` : "Faltam escolhas em uma categoria.",
    CATEGORY_MAX: d ? `Você escolheu itens demais em ${d}.` : "Há escolhas demais em uma categoria.",
    VERSION_CONFLICT: "Seu pedido foi alterado em outro aparelho. Recarregue para ver a versão mais recente.",
    RATE_LIMITED: RATE_LIMITED_MESSAGE,
    UNKNOWN: "Não foi possível salvar o pedido. Tente novamente.",
  };
  return { code, message: texts[code] };
}
