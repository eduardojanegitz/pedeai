-- 2/4 · Produtos (disponibilidade e preço opcional) e participantes (celular e recuperação).
-- Aditiva. Participantes antigos continuam válidos, apenas sem celular (phone_e164 nulo).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0);

-- Celular em E.164 brasileiro (+55 + DDD + 8 ou 9 dígitos). Único; vários NULL são permitidos.
-- recovery_hash: hash do código de recuperação (nunca o código em texto).
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS phone_e164 text
    CONSTRAINT participants_phone_format CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+55[1-9][0-9][0-9]{8,9}$'),
  ADD COLUMN IF NOT EXISTS recovery_hash text,
  ADD COLUMN IF NOT EXISTS recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS participants_phone_key ON public.participants (phone_e164);
