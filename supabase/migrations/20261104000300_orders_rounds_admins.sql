-- 3/4 · Versão do pedido (edição concorrente), horários da rodada e administradores.
-- Aditiva.

-- version: aumenta a cada gravação; o cliente envia a versão que viu e o servidor rejeita se mudou.
-- last_request_id: chave de idempotência da última gravação (reenvio do mesmo pedido não duplica).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_request_id uuid;

-- Horários (decisão aprovada): ficam dentro da rodada. NULL = sem limite naquele lado.
-- A rodada aceita pedidos quando status = 'open' e agora está dentro da janela.
-- O encerramento é automático pelo horário; "reabrir" = admin ajusta/limpa closes_at ou reabre a rodada.
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS closes_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rounds_window_valid') THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_window_valid
      CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at);
  END IF;
END $$;

-- Estado efetivo calculado no servidor do banco (nunca pelo relógio do navegador).
CREATE OR REPLACE FUNCTION public.round_state(r public.rounds)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN r.status <> 'open' THEN 'closed'
    WHEN r.opens_at IS NOT NULL AND now() < r.opens_at THEN 'waiting'
    WHEN r.closes_at IS NOT NULL AND now() >= r.closes_at THEN 'closed'
    ELSE 'open'
  END
$$;

-- Administradores. Sem políticas de acesso: só o servidor (service_role) lê e escreve.
-- Cadastro público de admin não existe; o primeiro é incluído manualmente (ver docs no Bloco 2).
CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admins FROM anon, authenticated;
GRANT ALL ON public.admins TO service_role;
