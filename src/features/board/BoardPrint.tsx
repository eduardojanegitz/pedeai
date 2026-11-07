import { useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Printer } from "lucide-react";
import { ComandaSheet } from "@/features/admin/ComandaSheet";
import {
  PAPERS,
  pageCss,
  rollHeightMm,
  type ComandaMode,
  type PaperSize,
} from "@/features/admin/comanda";
import "@/features/admin/print-root.css";
import type { RoundOrder } from "@/lib/orders.functions";

const seg = (on: boolean) =>
  `min-h-10 rounded-full px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "bg-primary text-primary-foreground" : ""}`;

/** Imprime a comanda (consolidada ou por pessoa) da página do estabelecimento: 80 mm, 58 mm ou A4. */
export function BoardPrint({
  roundName,
  orders,
  generatedAt,
}: {
  roundName: string;
  orders: RoundOrder[];
  generatedAt: string;
}) {
  const [mode, setMode] = useState<ComandaMode>("kitchen");
  const [paper, setPaper] = useState<PaperSize>("80mm");
  const [rollHeight, setRollHeight] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const roll = PAPERS[paper].pageWidthMm;

  const print = () => {
    const root = rootRef.current;
    const sheet = root?.querySelector<HTMLElement>(".comanda");
    let h: number | null = null;
    if (roll !== null && root && sheet) {
      // Mede a folha na largura do papel (fora da tela) para dar altura certa à bobina.
      root.style.cssText = `display:block;position:absolute;left:-9999px;top:0;width:${roll}mm;visibility:hidden`;
      h = rollHeightMm(sheet);
      root.style.cssText = "";
    }
    flushSync(() => setRollHeight(h));
    window.print();
  };

  return (
    <section aria-label="Imprimir comanda" className="pop-card p-4">
      <h2 className="flex items-center gap-2 text-3xl">
        <Printer className="h-6 w-6" aria-hidden /> Imprimir comanda
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Modelo"
          className="inline-flex rounded-3xl border-2 border-foreground bg-card p-1"
        >
          <button
            type="button"
            aria-pressed={mode === "kitchen"}
            className={seg(mode === "kitchen")}
            onClick={() => setMode("kitchen")}
          >
            Totais
          </button>
          <button
            type="button"
            aria-pressed={mode === "people"}
            className={seg(mode === "people")}
            onClick={() => setMode("people")}
          >
            Uma por pessoa
          </button>
        </div>
        <div
          role="group"
          aria-label="Papel"
          className="inline-flex flex-wrap rounded-3xl border-2 border-foreground bg-card p-1"
        >
          {(Object.keys(PAPERS) as PaperSize[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={paper === k}
              className={seg(paper === k)}
              onClick={() => setPaper(k)}
            >
              {PAPERS[k].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={print}
          disabled={orders.length === 0}
          className="pop-press inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-pop disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Printer className="h-4 w-4" aria-hidden /> Imprimir
        </button>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <div ref={rootRef} className="comanda-print-root" aria-hidden>
            <style>{pageCss(paper, rollHeight)}</style>
            <ComandaSheet
              roundName={roundName}
              generatedAt={generatedAt}
              orders={orders}
              mode={mode}
              paper={paper}
              showPhone={false}
              showPrices={false}
              changed={new Map()}
              lastPrintedAt={null}
            />
          </div>,
          document.body,
        )}
    </section>
  );
}
