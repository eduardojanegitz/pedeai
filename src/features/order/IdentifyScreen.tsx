import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { identifyParticipant, recoverParticipant } from "@/lib/identity.functions";
import { makeToken, saveToken } from "@/lib/participant";
import { maskPhoneInput } from "@/lib/phone";
import { formatRecoveryCode } from "@/lib/recovery-code";
import { RATE_LIMITED_MESSAGE } from "@/lib/order-errors";
import { Shell } from "./Shell";
import { loadProfile, saveProfile } from "./storage";
import { btnPrimary, btnPlain, errMsg, input } from "./ui";

type Mode = "new" | "recover";

/** Primeiro acesso (nome + celular) ou recuperação em outro aparelho (celular + código). */
export function IdentifyScreen({
  roundName,
  onDone,
}: {
  roundName: string;
  onDone: (token: string) => void;
}) {
  const reduce = useReducedMotion();
  const identify = useServerFn(identifyParticipant);
  const recover = useServerFn(recoverParticipant);
  const profile = loadProfile();

  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string; code: string } | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const token = makeToken();
    try {
      if (mode === "new") {
        const r = await identify({ data: { name, phone, token } });
        if (r.status === "created") {
          saveToken(token);
          saveProfile({ name: name.trim(), phone });
          setCreated({ token, code: r.recoveryCode });
        } else if (r.status === "exists") {
          setMode("recover");
          setCode("");
          setNotice(
            "Este celular já tem cadastro. Digite seu código de recuperação para continuar.",
          );
        } else if (r.status === "invalid_phone") setError(r.message);
        else setError(RATE_LIMITED_MESSAGE);
      } else {
        const r = await recover({ data: { phone, code, token } });
        if (r.status === "recovered") {
          saveToken(token);
          saveProfile({ name: r.name, phone });
          onDone(token);
        } else if (r.status === "invalid_phone") setError(r.message);
        else if (r.status === "rate_limited") setError(RATE_LIMITED_MESSAGE);
        else setError("Celular ou código não conferem. Confira e tente de novo.");
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) return <CodeScreen code={created.code} onContinue={() => onDone(created.token)} />;

  return (
    <Shell>
      <Logo className="text-6xl" />
      <p className="mt-5 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {roundName}
      </p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={reduce ? false : { opacity: 0, x: mode === "new" ? -16 : 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <h1 className="mt-2 text-5xl">
            {mode === "new" ? "Quem é você?" : "Bem-vindo de volta!"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {mode === "new"
              ? "Seu nome e celular para fazer o pedido."
              : "Digite o celular e o código de recuperação que você recebeu no primeiro acesso."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4 text-left" noValidate>
            {mode === "new" && (
              <div>
                <label htmlFor="who" className="mb-1 block text-sm font-bold">
                  Nome
                </label>
                <input
                  id="who"
                  autoComplete="name"
                  autoFocus
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="João Silva"
                  className={input}
                />
              </div>
            )}
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-bold">
                Celular com DDD
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                required
                value={phone}
                onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
                placeholder="(15) 99999-9999"
                aria-describedby={error ? "id-error" : undefined}
                className={input}
              />
            </div>
            {mode === "recover" && (
              <div>
                <label htmlFor="code" className="mb-1 block text-sm font-bold">
                  Código de recuperação
                </label>
                <input
                  id="code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  autoFocus={!!notice}
                  value={code}
                  onChange={(e) => setCode(formatRecoveryCode(e.target.value.slice(0, 12)))}
                  placeholder="K7M2Q-9XAWB"
                  className={`${input} text-center font-mono tracking-widest`}
                />
              </div>
            )}

            {notice && (
              <p
                role="status"
                className="rounded-2xl border-2 border-foreground bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
              >
                {notice}
              </p>
            )}
            {error && (
              <p
                id="id-error"
                role="alert"
                className="rounded-2xl border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
              >
                {error}
              </p>
            )}

            <button
              disabled={busy || !phone.trim() || (mode === "new" ? !name.trim() : !code.trim())}
              className={`${btnPrimary} w-full text-lg`}
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
              {busy ? "Aguarde…" : mode === "new" ? "Ver cardápio" : "Recuperar meu pedido"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => switchMode(mode === "new" ? "recover" : "new")}
            className="mt-5 text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mode === "new" ? "Já pedi antes" : "Primeiro acesso? Cadastre-se"}
          </button>
          {mode === "recover" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Perdeu o código? Peça ajuda ao organizador.
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

/** Mostra o código de recuperação uma única vez. */
export function CodeScreen({
  code,
  onContinue,
  title = "Cadastro feito!",
}: {
  code: string;
  onContinue: () => void;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sem permissão: a pessoa copia manualmente */
    }
  };
  return (
    <Shell>
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border-2 border-foreground bg-primary text-primary-foreground shadow-pop">
        <ShieldCheck className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="mt-4 text-5xl">{title}</h1>
      <p className="mt-3 text-muted-foreground">
        Guarde este código. Ele é a <strong>única forma</strong> de recuperar seu pedido em outro
        aparelho e não será mostrado de novo.
      </p>
      <p
        className="mt-5 select-all rounded-2xl border-2 border-dashed border-foreground bg-accent px-4 py-5 font-mono text-3xl font-bold tracking-widest text-accent-foreground"
        aria-label={`Seu código de recuperação: ${code.split("").join(" ")}`}
      >
        {code}
      </p>
      <button onClick={copy} className={`${btnPlain} mt-4 w-full`}>
        {copied ? (
          <Check className="h-5 w-5" aria-hidden />
        ) : (
          <Copy className="h-5 w-5" aria-hidden />
        )}
        {copied ? "Copiado!" : "Copiar código"}
      </button>
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-left text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
        />
        <span>Anotei ou copiei meu código em um lugar seguro.</span>
      </label>
      <button
        disabled={!saved}
        onClick={onContinue}
        className={`${btnPrimary} mt-4 w-full text-lg`}
      >
        <KeyRound className="h-5 w-5" aria-hidden /> Continuar
      </button>
    </Shell>
  );
}
