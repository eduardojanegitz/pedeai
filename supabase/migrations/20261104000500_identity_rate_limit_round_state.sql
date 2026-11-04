-- 5/5 · Limite de requisições, recuperação com tentativas controladas e estado da rodada.
-- Aditiva. Todas as funções são executáveis só pelo servidor (service_role).

-- ---------- Limite de requisições (sem infraestrutura extra) ----------
-- key = hash do IP + ação (o IP em texto nunca é guardado).
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;

-- true = dentro do limite; false = excedeu. Atômico (um UPSERT).
CREATE OR REPLACE FUNCTION public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_hits integer;
BEGIN
  INSERT INTO rate_limits AS r (key, window_start, hits) VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.hits + 1 END,
    window_start = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE r.window_start END
  RETURNING r.hits INTO v_hits;
  IF random() < 0.01 THEN
    DELETE FROM rate_limits WHERE window_start < now() - interval '1 day';
  END IF;
  RETURN v_hits <= p_max;
END $$;

-- ---------- Recuperação por celular + código ----------
-- begin_recovery reserva UMA tentativa de forma atômica (tentativas paralelas não burlam o limite)
-- e bloqueia por 15 min ao chegar a 5. Sem linhas = celular desconhecido, sem código ou bloqueado
-- (o servidor responde igual nos três casos, evitando enumeração).
CREATE OR REPLACE FUNCTION public.begin_recovery(p_phone text)
RETURNS TABLE (participant_id uuid, recovery_hash text)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v participants%ROWTYPE;
  v_attempts integer;
BEGIN
  SELECT * INTO v FROM participants WHERE phone_e164 = p_phone FOR UPDATE;
  IF NOT FOUND OR v.recovery_hash IS NULL THEN RETURN; END IF;
  IF v.locked_until IS NOT NULL AND v.locked_until > now() THEN RETURN; END IF;

  v_attempts := CASE WHEN v.locked_until IS NOT NULL THEN 1 ELSE v.recovery_attempts + 1 END;
  UPDATE participants
     SET recovery_attempts = v_attempts,
         locked_until = CASE WHEN v_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END
   WHERE id = v.id;

  participant_id := v.id;
  recovery_hash := v.recovery_hash;
  RETURN NEXT;
END $$;

-- Sucesso: vincula o novo aparelho (troca o token) e zera as tentativas.
CREATE OR REPLACE FUNCTION public.finish_recovery(p_participant uuid, p_token_hash text)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  UPDATE participants
     SET token_hash = p_token_hash, recovery_attempts = 0, locked_until = NULL
   WHERE id = p_participant;
$$;

-- ---------- Estado da rodada (relógio do banco, nunca do navegador) ----------
-- Rodada atual = a única com status 'open'. state: waiting | open | closed (por horário).
CREATE OR REPLACE FUNCTION public.get_active_round()
RETURNS TABLE (
  id uuid, name text, status text, opened_at timestamptz, closed_at timestamptz,
  opens_at timestamptz, closes_at timestamptz, state text, server_now timestamptz
) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT r.id, r.name, r.status, r.opened_at, r.closed_at, r.opens_at, r.closes_at,
         round_state(r), now()
    FROM rounds r WHERE r.status = 'open';
$$;

CREATE OR REPLACE FUNCTION public.get_round_state(p_round uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT round_state(r) FROM rounds r WHERE r.id = p_round;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.hit_rate_limit(text,integer,integer)',
    'public.begin_recovery(text)',
    'public.finish_recovery(uuid,text)',
    'public.get_active_round()',
    'public.get_round_state(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
