import { useCallback, useEffect, useRef, useState } from "react";
import { boardPulse, type BoardOrder } from "@/lib/board";
import { playChime, soundReady, soundSupported, unlockSound } from "@/features/admin/chime";
import { diffPulse, strongestKind } from "@/features/admin/order-alerts";
import type { PulseRow } from "@/lib/orders.functions";

/**
 * Novidades na comanda ao vivo: destaca pedidos novos/alterados e (se ligado) toca o alerta.
 * A primeira leitura é só a linha de base. O som precisa ser liberado por um clique do usuário.
 */
export function useBoardAlerts(orders: BoardOrder[] | undefined) {
  const prev = useRef<PulseRow[] | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const [enabled, setEnabledState] = useState(false);
  const enabledRef = useRef(false);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!orders) return;
    const next = boardPulse(orders);
    const events = diffPulse(prev.current, next);
    prev.current = next;
    if (events.length === 0) return;
    setNewIds((old) => {
      const s = new Set(old);
      for (const e of events) if (e.kind !== "cancelled") s.add(e.orderId);
      return s;
    });
    const kind = strongestKind(events);
    if (kind && enabledRef.current) playChime(kind, 0.8);
  }, [orders]);

  const setEnabled = useCallback(async (on: boolean) => {
    if (!on) return setEnabledState(false);
    if (!soundSupported() || !(await unlockSound())) return;
    setEnabledState(true);
    playChime("new", 0.8);
  }, []);

  return {
    supported: typeof window === "undefined" ? true : soundSupported(),
    enabled,
    setEnabled,
    soundReady,
    newIds,
    markSeen: () => setNewIds(new Set()),
  };
}
