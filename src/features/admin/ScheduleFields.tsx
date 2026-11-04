import { Clock } from "lucide-react";
import { field } from "./ui";

/** Campos de abertura/encerramento em hora de Brasília (valores "YYYY-MM-DDTHH:mm"; vazio = sem limite). */
export function ScheduleFields({
  idPrefix,
  opens,
  closes,
  onOpens,
  onCloses,
  showOpens = true,
}: {
  idPrefix: string;
  opens: string;
  closes: string;
  onOpens: (v: string) => void;
  onCloses: (v: string) => void;
  showOpens?: boolean;
}) {
  return (
    <div>
      <div className={`grid gap-3 ${showOpens ? "sm:grid-cols-2" : ""}`}>
        {showOpens && (
          <div>
            <label htmlFor={`${idPrefix}-opens`} className="mb-1 block text-sm font-bold">
              Abertura
            </label>
            <input
              id={`${idPrefix}-opens`}
              type="datetime-local"
              value={opens}
              onChange={(e) => onOpens(e.target.value)}
              className={field}
            />
          </div>
        )}
        <div>
          <label htmlFor={`${idPrefix}-closes`} className="mb-1 block text-sm font-bold">
            Encerramento
          </label>
          <input
            id={`${idPrefix}-closes`}
            type="datetime-local"
            value={closes}
            onChange={(e) => onCloses(e.target.value)}
            className={field}
          />
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden /> Horário de Brasília. Em branco = sem limite. O
        encerramento é automático.
      </p>
    </div>
  );
}
