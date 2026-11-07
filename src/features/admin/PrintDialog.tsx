import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatSaoPaulo } from "@/lib/format";
import { markRoundPrinted, type AdminRound, type RoundOrder } from "@/lib/orders.functions";
import {
  changedSincePrint,
  defaultPrintOptions,
  ordersToPrint,
  PAPERS,
  pageCss,
  rollHeightMm,
  snapshotInstant,
  type PaperSize,
  type PrintOptions,
} from "./comanda";
import { ComandaSheet } from "./ComandaSheet";
import { btnPlain, btnPrimary, errMsg } from "./ui";

const STORAGE_KEY = "pedeai:print-options";

function loadOptions(): PrintOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrintOptions;
    const p = JSON.parse(raw) as Partial<PrintOptions>;
    return {
      mode: p.mode === "people" ? "people" : "kitchen",
      paper: p.paper && p.paper in PAPERS ? p.paper : "80mm",
      showPhone: p.showPhone === true,
      showPrices: p.showPrices === true,
      onlyChanged: false,
    };
  } catch {
    return defaultPrintOptions;
  }
}
function saveOptions(o: PrintOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...o, onlyChanged: false }));
  } catch {
    /* só vale nesta sessão */
  }
}

const seg = (on: boolean) =>
  `min-h-10 rounded-full px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "bg-primary text-primary-foreground" : ""}`;

/** Configura, mostra a prévia e imprime a comanda; depois pergunta se saiu certo para registrar. */
export function PrintDialog({
  open,
  onOpenChange,
  round,
  orders,
  preset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  round: AdminRound;
  orders: RoundOrder[];
  preset?: Partial<PrintOptions> | undefined;
}) {
  const qc = useQueryClient();
  const mark = useServerFn(markRoundPrinted);
  const [opts, setOpts] = useState<PrintOptions>(defaultPrintOptions);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [rollHeight, setRollHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setOpts({ ...loadOptions(), ...preset });
    setAsked(false);
  }, [open, preset]);

  // Novo instante a cada abertura da janela.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const generatedAt = useMemo(() => new Date().toISOString(), [open]);
  const changed = useMemo(
    () => changedSincePrint(orders, round.last_printed_at),
    [orders, round.last_printed_at],
  );
  const sheetOrders = useMemo(() => ordersToPrint(orders, opts, changed), [orders, opts, changed]);
  const priced = orders.some((o) => o.items.some((i) => i.price_cents != null));
  const people = opts.mode === "people";
  const paper = PAPERS[opts.paper];

  // Bobina: a altura da página sai da medida real da folha (o Chrome não aceita "altura automática").
  useLayoutEffect(() => {
    const sheetEl = previewRef.current?.querySelector<HTMLElement>(".comanda");
    setRollHeight(open && paper.pageWidthMm !== null && sheetEl ? rollHeightMm(sheetEl) : null);
  }, [open, opts, sheetOrders, paper.pageWidthMm]);

  const set = (patch: Partial<PrintOptions>) =>
    setOpts((o) => {
      const next = { ...o, ...patch };
      saveOptions(next);
      return next;
    });

  // O navegador avisa quando a janela de impressão fecha (impresso OU cancelado): perguntamos qual.
  useEffect(() => {
    if (!open) return;
    const after = () => setAsked(true);
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, [open]);

  const print = () => {
    if (sheetOrders.length === 0) {
      toast.error("Não há pedidos para imprimir com essas opções.");
      return;
    }
    setAsked(false);
    window.print();
  };

  const confirmPrinted = async () => {
    const at = snapshotInstant(orders);
    if (!at) return;
    setBusy(true);
    try {
      await mark({ data: { roundId: round.id, printedAt: at } });
      await qc.invalidateQueries({ queryKey: ["rounds"] });
      toast.success("Impressão registrada");
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <ComandaSheet
      roundName={round.name}
      generatedAt={generatedAt}
      orders={sheetOrders}
      mode={opts.mode}
      paper={opts.paper}
      showPhone={opts.showPhone && people}
      showPrices={opts.showPrices && priced}
      changed={changed}
      lastPrintedAt={round.last_printed_at}
    />
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-2 border-foreground bg-background sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-4xl font-normal">
              Imprimir comanda
            </DialogTitle>
            <DialogDescription>
              Escolha o modelo e o papel. A prévia ao lado é exatamente o que sai na impressora.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-1.5 text-sm font-bold">Modelo</legend>
                <div
                  role="group"
                  aria-label="Modelo"
                  className="inline-flex flex-wrap rounded-3xl border-2 border-foreground bg-card p-1"
                >
                  <button
                    type="button"
                    aria-pressed={!people}
                    className={seg(!people)}
                    onClick={() => set({ mode: "kitchen" })}
                  >
                    Para o estabelecimento
                  </button>
                  <button
                    type="button"
                    aria-pressed={people}
                    className={seg(people)}
                    onClick={() => set({ mode: "people" })}
                  >
                    Uma por pessoa
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {people
                    ? "Um ticket por participante, para separar e entregar."
                    : "Totais por categoria e produto, com as observações. É o que se leva ao balcão."}
                </p>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-sm font-bold">Papel</legend>
                <div
                  role="group"
                  aria-label="Papel"
                  className="inline-flex flex-wrap rounded-3xl border-2 border-foreground bg-card p-1"
                >
                  {(Object.keys(PAPERS) as PaperSize[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={opts.paper === k}
                      className={seg(opts.paper === k)}
                      onClick={() => set({ paper: k })}
                    >
                      {PAPERS[k].label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {paper.hint}. Na janela de impressão do navegador, escolha a impressora certa.
                </p>
              </fieldset>

              <div className="space-y-2">
                {people && (
                  <Check
                    label="Incluir o celular"
                    checked={opts.showPhone}
                    onChange={(v) => set({ showPhone: v })}
                  />
                )}
                {priced && (
                  <Check
                    label="Incluir valores"
                    checked={opts.showPrices}
                    onChange={(v) => set({ showPrices: v })}
                  />
                )}
                {people && (
                  <Check
                    label={`Só os que mudaram desde a última impressão (${changed.size})`}
                    checked={opts.onlyChanged}
                    disabled={changed.size === 0}
                    onChange={(v) => setOpts((o) => ({ ...o, onlyChanged: v }))}
                  />
                )}
              </div>

              <p className="text-sm text-muted-foreground" aria-live="polite">
                {round.last_printed_at
                  ? `Última impressão registrada: ${formatSaoPaulo(round.last_printed_at)}.`
                  : "Esta rodada ainda não teve comanda impressa."}
                {changed.size > 0 && ` ${changed.size} pedido(s) mudaram depois disso.`}
              </p>

              {asked ? (
                <div
                  role="alert"
                  className="rounded-2xl border-2 border-foreground bg-accent p-3 text-accent-foreground"
                >
                  <p className="text-sm font-bold">A comanda saiu certa na impressora?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy}
                      onClick={() => void confirmPrinted()}
                    >
                      Sim, registrar impressão
                    </button>
                    <button type="button" className={btnPlain} onClick={() => setAsked(false)}>
                      Não, voltar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" className={btnPrimary} onClick={print}>
                    <Printer className="h-4 w-4" aria-hidden /> Imprimir
                  </button>
                  <button type="button" className={btnPlain} onClick={() => onOpenChange(false)}>
                    Fechar
                  </button>
                </div>
              )}
            </div>

            <div
              aria-label="Prévia da comanda"
              className="max-h-[60vh] overflow-auto rounded-2xl border-2 border-foreground bg-muted p-3"
            >
              <div
                ref={previewRef}
                className="mx-auto bg-white shadow-md"
                style={{
                  width: paper.pageWidthMm ? `${paper.pageWidthMm}mm` : "190mm",
                  maxWidth: "100%",
                }}
              >
                {sheet}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="comanda-print-root" aria-hidden>
            <style>{pageCss(opts.paper, rollHeight)}</style>
            {sheet}
          </div>,
          document.body,
        )}
    </>
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex min-h-10 items-center gap-3 text-sm font-semibold ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}
