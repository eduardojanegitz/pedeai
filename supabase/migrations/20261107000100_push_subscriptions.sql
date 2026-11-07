-- v3 · 6 · Notificação no celular: inscrições Web Push dos participantes.
--
-- Aditiva. Só o servidor (service_role) acessa; sem policies. O endpoint é um endereço secreto do
-- serviço de push do navegador (não é senha, mas não deve vazar). Apagamos a inscrição quando o
-- serviço responde que ela expirou.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_endpoint_len CHECK (char_length(endpoint) BETWEEN 20 AND 1000)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_participant_idx
  ON public.push_subscriptions (participant_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
