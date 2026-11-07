import { Bell, BellOff, Volume2, WifiOff } from "lucide-react";
import { useId } from "react";
import { btnPlain, btnPrimary } from "./ui";
import type { useOrderAlerts } from "./useOrderAlerts";

type Alerts = ReturnType<typeof useOrderAlerts>;

/** Controles do alerta sonoro: ligar/desligar, volume, testar, e avisos (som bloqueado, sem conexão). */
export function AlertsBar({ alerts }: { alerts: Alerts }) {
  const volumeId = useId();
  if (!alerts.supported) {
    return (
      <p className="mb-4 text-sm text-muted-foreground">
        Este navegador não toca alertas sonoros. Os pedidos novos continuam aparecendo na tela.
      </p>
    );
  }
  return (
    <section aria-label="Alertas sonoros" className="mb-5">
      <div className="pop-card flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
        <button
          type="button"
          aria-pressed={alerts.enabled}
          onClick={() => void alerts.setEnabled(!alerts.enabled)}
          className={alerts.enabled ? btnPrimary : btnPlain}
        >
          {alerts.enabled ? (
            <Bell className="h-4 w-4" aria-hidden />
          ) : (
            <BellOff className="h-4 w-4" aria-hidden />
          )}
          {alerts.enabled ? "Alertas ligados" : "Ativar alertas sonoros"}
        </button>

        <div className="flex items-center gap-2">
          <label
            htmlFor={volumeId}
            className="inline-flex items-center gap-1.5 text-sm font-semibold"
          >
            <Volume2 className="h-4 w-4" aria-hidden /> Volume
          </label>
          <input
            id={volumeId}
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(alerts.volume * 100)}
            onChange={(e) => alerts.setVolume(Number(e.target.value) / 100)}
            className="w-28 accent-[var(--primary)]"
          />
          <button type="button" className={btnPlain} onClick={() => void alerts.test("new")}>
            Testar som
          </button>
        </div>

        {alerts.offline && (
          <p
            role="status"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-destructive"
          >
            <WifiOff className="h-4 w-4" aria-hidden /> Sem conexão: os alertas voltam sozinhos
          </p>
        )}
      </div>

      {alerts.blocked && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-foreground bg-accent p-3 text-accent-foreground"
        >
          <p className="text-sm font-bold">
            O navegador bloqueou o som depois de recarregar a página. Clique para liberar.
          </p>
          <button type="button" className={btnPrimary} onClick={() => void alerts.unlock()}>
            Liberar som
          </button>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        O som toca com a aba aberta, mesmo em segundo plano. Se fechar a aba ou o navegador, não há
        alerta.
      </p>
    </section>
  );
}
