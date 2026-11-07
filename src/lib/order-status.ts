/** Estado do pedido, do ponto de vista de quem pediu. */
export type OrderProgress = "received" | "preparing" | "ready";

/**
 * Recebido: a rodada ainda aceita pedidos (ou o pedido ainda não foi trabalhado).
 * Em preparo: a rodada encerrou e o pedido ainda não foi concluído.
 * Pronto: o estabelecimento marcou como concluído.
 * Se o pedido foi editado depois de concluído, o aviso é do organizador: para quem pediu continua pronto.
 */
export function orderProgress(input: {
  roundState: "waiting" | "open" | "closed";
  doneAt: string | null;
}): OrderProgress {
  if (input.doneAt) return "ready";
  return input.roundState === "closed" ? "preparing" : "received";
}

export const PROGRESS_LABEL: Record<OrderProgress, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto",
};

/** Só aceita endereços de push dos serviços conhecidos (o servidor faz requisição para eles). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9.-]+\.push\.apple\.com$/,
  /^[a-z0-9.-]+\.notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
  return PUSH_HOSTS.some((re) => re.test(u.hostname));
}
