import { motion, useReducedMotion } from "motion/react";
import { BadgeCheck, Copy, Landmark } from "lucide-react";
import { toast } from "sonner";
import { QrCode } from "@/components/QrCode";
import { copyToClipboard } from "@/lib/clipboard";
import { formatBRL, formatSaoPauloTime } from "@/lib/format";
import type { MyPayment } from "@/lib/orders.functions";
import { btnPlain, btnPrimary } from "./ui";
import { useMyPayment } from "./useMyPayment";

/**
 * Pagamento por Pix do pedido: valor, QR Code e "copia e cola" do organizador que abriu a rodada.
 * `compact` é a versão da tela de confirmação (QR menor e chamada de "último passo"); sem ela,
 * é o card da tela do pedido. Some se não houver preço ou Pix. O organizador confirma o recebimento.
 */
export function PixPaymentView({
  payment: p,
  compact = false,
}: {
  payment: MyPayment | undefined;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  if (!p || p.state === "unavailable") return null;

  if (p.state === "paid") {
    return (
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        aria-label="Pagamento"
        className={`pop-card bg-secondary p-4 text-left text-secondary-foreground ${compact ? "" : "mt-4"}`}
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
      className={`pop-card p-4 text-left ${compact ? "bg-card" : "mt-4"}`}
    >
      {compact ? (
        <>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary">
            <Landmark className="h-4 w-4" aria-hidden /> Último passo: pagar por Pix
          </p>
          <p className="mt-1 text-sm font-semibold">
            Seu pedido está confirmado, mas o pagamento ainda não foi feito.
          </p>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
          <Landmark className="h-4 w-4" aria-hidden /> Pagar por Pix
        </p>
      )}
      <p className={`mt-1 font-display leading-none ${compact ? "text-4xl" : "text-5xl"}`}>
        {formatBRL(p.totalCents)}
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <QrCode
          text={p.payload}
          label={`QR Code Pix de ${formatBRL(p.totalCents)}`}
          className={`mx-auto rounded-2xl border-2 border-foreground ${compact ? "h-40 w-40" : "h-48 w-48"}`}
        />
        <div className="min-w-0">
          <p className="text-sm">
            Para <strong>{p.receiver}</strong> · chave {p.keyMasked}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            No app do seu banco: Pix → Pix Copia e Cola (ou ler o QR Code). O valor já vem
            preenchido.
          </p>
          <button
            type="button"
            className={`${compact ? btnPrimary : btnPlain} mt-3`}
            onClick={() => void copy()}
          >
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

/** Card de pagamento da tela do pedido (busca os dados sozinho). */
export function PixPayment({ token, roundId }: { token: string; roundId: string }) {
  const q = useMyPayment(token, roundId);
  return <PixPaymentView payment={q.data} />;
}
