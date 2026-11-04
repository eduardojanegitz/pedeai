import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { attachPhone, rotateRecoveryCode } from "@/lib/identity.functions";
import { RATE_LIMITED_MESSAGE } from "@/lib/order-errors";
import { maskPhoneInput } from "@/lib/phone";
import { btnPlain, btnPrimary, errMsg, input } from "./ui";
import { saveProfile } from "./storage";

/**
 * Recuperação em outro aparelho: quem não tem celular (cadastro antigo) cadastra agora;
 * quem já tem pode gerar um código novo (o anterior deixa de valer).
 */
export function RecoveryDialog({
  open,
  onOpenChange,
  token,
  name,
  hasPhone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  token: string;
  name: string;
  hasPhone: boolean;
}) {
  const qc = useQueryClient();
  const attach = useServerFn(attachPhone);
  const rotate = useServerFn(rotateRecoveryCode);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const close = (o: boolean) => {
    if (!o) {
      setCode(null);
      setError(null);
      setCopied(false);
    }
    onOpenChange(o);
  };

  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = hasPhone
        ? await rotate({ data: { token } })
        : await attach({ data: { phone, token } });
      if (r.status === "created") {
        setCode(r.recoveryCode);
        if (!hasPhone) {
          saveProfile({ name, phone });
          void qc.invalidateQueries({ queryKey: ["my-order"] });
        }
      } else if (r.status === "invalid_phone") setError(r.message);
      else if (r.status === "exists") setError("Este celular já está cadastrado em outra conta.");
      else if (r.status === "rate_limited") setError(RATE_LIMITED_MESSAGE);
      else setError("Não foi possível concluir agora. Recarregue a página e tente de novo.");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      toast.error("Não foi possível copiar. Anote o código manualmente.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="rounded-3xl border-2 border-foreground bg-background shadow-pop-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-4xl font-normal">
            {code
              ? "Guarde seu código"
              : hasPhone
                ? "Gerar novo código"
                : "Recuperar em outro aparelho"}
          </DialogTitle>
          <DialogDescription>
            {code
              ? "Ele não será mostrado de novo. Com ele e seu celular você recupera este pedido em qualquer aparelho."
              : hasPhone
                ? "O código anterior deixará de funcionar."
                : "Cadastre seu celular para poder acessar este pedido em outro aparelho."}
          </DialogDescription>
        </DialogHeader>

        {code ? (
          <div>
            <p className="select-all rounded-2xl border-2 border-dashed border-foreground bg-accent px-4 py-5 text-center font-mono text-3xl font-bold tracking-widest text-accent-foreground">
              {code}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={copy} className={`${btnPlain} flex-1`}>
                {copied ? (
                  <Check className="h-5 w-5" aria-hidden />
                ) : (
                  <Copy className="h-5 w-5" aria-hidden />
                )}
                {copied ? "Copiado!" : "Copiar"}
              </button>
              <button onClick={() => close(false)} className={`${btnPrimary} flex-1`}>
                Pronto
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={run} className="space-y-4" noValidate>
            {!hasPhone && (
              <div>
                <label htmlFor="attach-phone" className="mb-1 block text-sm font-bold">
                  Celular com DDD
                </label>
                <input
                  id="attach-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
                  placeholder="(15) 99999-9999"
                  className={input}
                />
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-2xl border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
              >
                {error}
              </p>
            )}
            <button
              disabled={busy || (!hasPhone && !phone.trim())}
              className={`${btnPrimary} w-full`}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="h-5 w-5" aria-hidden />
              )}
              {hasPhone ? "Gerar novo código" : "Cadastrar e gerar código"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
