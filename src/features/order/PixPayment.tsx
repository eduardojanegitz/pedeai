import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { BadgeCheck, Copy, Landmark } from "lucide-react";
import { toast } from "sonner";
import { QrCode } from "@/components/QrCode";
import { copyToClipboard } from "@/lib/clipboard";
import { formatBRL, formatSaoPauloTime } from "@/lib/format";
import { getMyPayment } from "@/lib/orders.functions";
import { btnPlain } from "./ui";

/**
 * Pagamento por Pix do pedido confirmado: valor, QR Code e "copia e cola" do organizador que abriu
 * a rodada. Some se não houver preço ou Pix configurado. O organizador confirma o recebimento.
 */
export function PixPayment({ token, roundId }: { token: string; roundId: string }) {
  const reduce = useReducedMotion();
  const q = useQuery({
    queryKey: ["my-payment", token, roundId],
    queryFn: () => getMyPayment({ data: { token, roundId } }),
    refetchInterval: 15_000,
    retry: false,
  });
  const p = q.data;
  if (!p || p.state === "unavailable") return null;

  if (p.state === "paid") {
    return (
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        aria-label="Pagamento"
        className="pop-card mt-4 bg-secondary p-4 text-secondary-foreground"
      >
        <p className="flex items-center gap-2 text-lg font-bold">
          <BadgeCheck className="h-5 w-5" aria-hidden /> Pagamento confirmado
        </p>
        <p className="mt-1 text-sm">
          {formatBRL(p.totalCents)} · confirmado às {formatSaoPauloTime(p.paidAt)}
        </p>
        {p.changedAfter && (
          <p role="alert" className="mt-2 text-sm font-bold">
            Seu pedido mudou depois do pagamento. Combine com o organizador qualquer diferença de
            valor.
          </p>
        )}
      </motion.section>
    );
  }

  const copy = async () => {
    try {
      await copyToClipboard(p.payload);
      toast.success("Código Pix copiado");
    } catch {
      toast.error("Não foi possível copiar. Use o QR Code.");
    }
  };

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label="Pagamento por Pix"
      className="pop-card mt-4 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
        <Landmark className="h-4 w-4" aria-hidden /> Pagar por Pix
      </p>
      <p className="mt-1 font-display text-5xl leading-none">{formatBRL(p.totalCents)}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <QrCode
          text={p.payload}
          label={`QR Code Pix de ${formatBRL(p.totalCents)}`}
          className="mx-auto h-48 w-48 rounded-2xl border-2 border-foreground"
        />
        <div className="min-w-0">
          <p className="text-sm">
            Para <strong>{p.receiver}</strong> · chave {p.keyMasked}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            No app do seu banco: Pix → Pix Copia e Cola (ou ler o QR Code). O valor já vem
            preenchido.
          </p>
          <button type="button" className={`${btnPlain} mt-3`} onClick={() => void copy()}>
            <Copy className="h-4 w-4" aria-hidden /> Copiar código Pix
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            Depois de pagar, o organizador confirma o seu pagamento aqui.
          </p>
        </div>
      </div>
    </motion.section>
  );
}
