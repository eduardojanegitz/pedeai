import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Copy, Link2, MessageCircle, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { QrCode } from "@/components/QrCode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createBoardLink,
  listBoardLinks,
  revokeBoardLink,
  type BoardLink,
} from "@/lib/board.functions";
import { copyToClipboard } from "@/lib/clipboard";
import { formatSaoPaulo } from "@/lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { isLocalAddress, loadPublicUrl, normalizePublicUrl, whatsappLink } from "./share";
import { btnPlain, btnPrimary, errMsg, field } from "./ui";

const HOURS = [
  { value: 6, label: "6 horas" },
  { value: 24, label: "24 horas" },
  { value: 72, label: "3 dias" },
] as const;

type Hours = (typeof HOURS)[number]["value"];

function status(l: BoardLink, now = Date.now()): { label: string; active: boolean } {
  if (l.revokedAt) return { label: "Revogado", active: false };
  if (Date.parse(l.expiresAt) <= now) return { label: "Expirado", active: false };
  return { label: "Ativo", active: true };
}

/**
 * Link do estabelecimento: página só de leitura, sem login, com a comanda ao vivo.
 * O link completo só é mostrado ao gerar (no banco fica apenas o hash); dá para revogar a qualquer hora.
 */
export function BoardLinkDialog({
  open,
  onOpenChange,
  round,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  round: { id: string; name: string };
}) {
  const qc = useQueryClient();
  const create = useServerFn(createBoardLink);
  const revoke = useServerFn(revokeBoardLink);
  const [hours, setHours] = useState<Hours>(24);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: string } | null>(null);
  const [toRevoke, setToRevoke] = useState<BoardLink | null>(null);

  useEffect(() => {
    if (!open) return;
    setAddress(loadPublicUrl() ?? window.location.origin);
    setFresh(null);
  }, [open]);

  const links = useQuery({
    queryKey: ["board-links", round.id],
    queryFn: () => listBoardLinks({ data: { roundId: round.id } }),
    enabled: open,
  });
  const origin = normalizePublicUrl(address);

  const generate = async () => {
    if (!origin) return;
    setBusy(true);
    try {
      const r = await create({ data: { roundId: round.id, hours } });
      setFresh({ url: `${origin}/comanda/${r.token}`, expiresAt: r.expiresAt });
      await qc.invalidateQueries({ queryKey: ["board-links", round.id] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async () => {
    const l = toRevoke;
    setToRevoke(null);
    if (!l) return;
    try {
      await revoke({ data: { id: l.id } });
      await qc.invalidateQueries({ queryKey: ["board-links", round.id] });
      toast.success("Link revogado");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const copy = (text: string, ok: string) =>
    copyToClipboard(text).then(
      () => toast.success(ok),
      () => toast.error("Não foi possível copiar. Selecione o texto e copie manualmente."),
    );

  const message = fresh
    ? `📋 *${round.name}* — comanda ao vivo\n\nAcompanhe os pedidos e imprima a comanda aqui:\n${fresh.url}\n\nA página atualiza sozinha. Link válido até ${formatSaoPaulo(fresh.expiresAt)}.`
    : "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-2 border-foreground bg-background sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-4xl font-normal">
              Link do estabelecimento
            </DialogTitle>
            <DialogDescription>
              Uma página só de leitura, sem login, com os pedidos ao vivo, alerta sonoro e botão de
              imprimir a comanda e marcar cada pedido como concluído. Não mostra celular, valores
              nem pagamentos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <div>
                <label htmlFor="bl-url" className="text-sm font-bold">
                  Endereço do site
                </label>
                <input
                  id="bl-url"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={!origin}
                  className={`${field} mt-1`}
                />
              </div>
              <div>
                <label htmlFor="bl-hours" className="text-sm font-bold">
                  Vale por
                </label>
                <select
                  id="bl-hours"
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value) as Hours)}
                  className={`${field} mt-1`}
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className={btnPrimary}
                disabled={!origin || busy}
                onClick={() => void generate()}
              >
                <Link2 className="h-4 w-4" aria-hidden /> Gerar link
              </button>
            </div>
            {!origin && (
              <p role="alert" className="text-sm font-bold text-destructive">
                Endereço inválido. Exemplo: meusite.com.br
              </p>
            )}
            {origin && isLocalAddress(origin) && (
              <p className="text-sm font-semibold text-destructive">
                Este endereço só funciona neste computador. Troque pelo endereço público do site
                antes de enviar o link.
              </p>
            )}

            {fresh && (
              <div
                aria-label="Link novo"
                className="grid gap-4 rounded-2xl border-2 border-foreground bg-secondary p-4 text-secondary-foreground sm:grid-cols-[auto_minmax(0,1fr)]"
              >
                <QrCode
                  text={fresh.url}
                  label="QR Code do link do estabelecimento"
                  className="mx-auto h-36 w-36 rounded-xl border-2 border-foreground"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    Link criado. Copie agora: por segurança, ele não aparece de novo.
                  </p>
                  <input
                    readOnly
                    aria-label="Link do estabelecimento"
                    value={fresh.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`${field} mt-2 text-foreground`}
                  />
                  <p className="mt-1 text-xs">Vale até {formatSaoPaulo(fresh.expiresAt)}.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btnPlain}
                      onClick={() => void copy(fresh.url, "Link copiado")}
                    >
                      <Copy className="h-4 w-4" aria-hidden /> Copiar link
                    </button>
                    <a
                      href={whatsappLink(message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={btnPlain}
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden /> Enviar pelo WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-2xl">Links desta rodada</h3>
              {links.isPending ? (
                <p className="mt-1 text-sm text-muted-foreground">Carregando…</p>
              ) : !links.data || links.data.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Nenhum link gerado ainda.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {links.data.map((l) => {
                    const s = status(l);
                    return (
                      <li
                        key={l.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-foreground px-3 py-2"
                      >
                        <p className="text-sm">
                          <span
                            className={`mr-2 inline-block rounded-full border-2 border-foreground px-2 py-0.5 text-xs font-bold ${s.active ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                          >
                            {s.label}
                          </span>
                          criado {formatSaoPaulo(l.createdAt)} · vale até{" "}
                          {formatSaoPaulo(l.expiresAt)}
                        </p>
                        {s.active && (
                          <button type="button" className={btnPlain} onClick={() => setToRevoke(l)}>
                            <ShieldOff className="h-4 w-4" aria-hidden /> Revogar
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(o) => !o && setToRevoke(null)}
        title="Revogar este link?"
        description="Quem estiver com a página aberta perde o acesso na próxima atualização. Você pode gerar outro link depois."
        confirmLabel="Revogar"
        onConfirm={() => void doRevoke()}
      />
    </>
  );
}
