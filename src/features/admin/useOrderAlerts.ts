import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getOrdersPulse, type PulseRow } from "@/lib/orders.functions";
import { playChime, soundReady, soundSupported, unlockSound } from "./chime";
import {
  describeEvents,
  diffPulse,
  strongestKind,
  titleWithCount,
  type AlertKind,
} from "./order-alerts";

export const PULSE_INTERVAL_MS = 5_000;
const STORAGE_KEY = "pedeai:order-alerts";

type Settings = { enabled: boolean; volume: number };
const DEFAULTS: Settings = { enabled: false, volume: 0.7 };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Settings>;
    const volume = typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : 0.7;
    return { enabled: p.enabled === true, volume };
  } catch {
    return DEFAULTS;
  }
}
function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

/**
 * Alertas de pedido novo no painel.
 * Consulta o "pulso" da rodada a cada 5 s (mesmo com a aba em segundo plano), recarrega a lista
 * quando algo muda e toca um som (se ligado). O som só pode ser liberado por um clique do usuário.
 */
export function useOrderAlerts({
  roundId,
  active,
}: {
  roundId: string | undefined;
  active: boolean;
}) {
  const qc = useQueryClient();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [blocked, setBlocked] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const prev = useRef<PulseRow[] | null>(null);
  const baseTitle = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Configuração salva (lida depois da montagem para não divergir do HTML do servidor).
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setBlocked(s.enabled && !soundReady());
  }, []);

  // Nova rodada selecionada: recomeça a comparação do zero (a primeira leitura nunca alerta).
  useEffect(() => {
    prev.current = null;
    setNewIds(new Set());
    setUnseen(0);
  }, [roundId]);

  const pulse = useQuery({
    queryKey: ["orders-pulse", roundId],
    queryFn: () => getOrdersPulse({ data: { roundId: roundId! } }),
    enabled: !!roundId && active,
    refetchInterval: PULSE_INTERVAL_MS,
    // Essencial: o organizador costuma ficar em outra aba esperando o alerta.
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!pulse.data) return;
    const events = diffPulse(prev.current, pulse.data);
    prev.current = pulse.data;
    if (events.length === 0) return;
    void qc.invalidateQueries({ queryKey: ["round-orders", roundId] });
    setNewIds((old) => {
      const next = new Set(old);
      for (const e of events) if (e.kind !== "cancelled") next.add(e.orderId);
      return next;
    });
    setUnseen((n) => n + events.length);
    toast(describeEvents(events));
    const kind = strongestKind(events);
    if (kind && settingsRef.current.enabled) {
      if (!playChime(kind, settingsRef.current.volume)) setBlocked(true);
    }
  }, [pulse.data, qc, roundId]);

  // Contagem no título da aba; zera quando o organizador volta para a aba.
  useEffect(() => {
    baseTitle.current ??= document.title;
    document.title = titleWithCount(baseTitle.current, unseen);
  }, [unseen]);
  useEffect(() => {
    const clear = () => {
      if (document.visibilityState === "visible") setUnseen(0);
    };
    window.addEventListener("focus", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("focus", clear);
      document.removeEventListener("visibilitychange", clear);
      if (baseTitle.current !== null) document.title = baseTitle.current;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  /** Liga/desliga. Ligar precisa acontecer dentro de um clique (regra dos navegadores). */
  const setEnabled = useCallback(
    async (on: boolean) => {
      if (!on) {
        update({ enabled: false });
        setBlocked(false);
        return;
      }
      if (!soundSupported() || !(await unlockSound())) {
        toast.error("Este navegador não liberou o som. Verifique se a aba não está silenciada.");
        return;
      }
      update({ enabled: true });
      setBlocked(false);
      playChime("new", settingsRef.current.volume);
    },
    [update],
  );

  /** Reativa o som depois de recarregar a página (o navegador volta a bloquear). */
  const unlock = useCallback(async () => {
    if (await unlockSound()) {
      setBlocked(false);
      playChime("new", settingsRef.current.volume);
    } else {
      toast.error("Não foi possível liberar o som neste navegador.");
    }
  }, []);

  const test = useCallback(async (kind: AlertKind = "new") => {
    if (!soundReady() && !(await unlockSound())) {
      toast.error("Não foi possível liberar o som neste navegador.");
      return;
    }
    setBlocked(false);
    playChime(kind, settingsRef.current.volume);
  }, []);

  return {
    supported: typeof window === "undefined" ? true : soundSupported(),
    enabled: settings.enabled,
    volume: settings.volume,
    setVolume: (v: number) => update({ volume: Math.min(1, Math.max(0, v)) }),
    setEnabled,
    unlock,
    test,
    blocked,
    unseen,
    newIds,
    markSeen: () => {
      setNewIds(new Set());
      setUnseen(0);
    },
    offline: pulse.isError,
  };
}
