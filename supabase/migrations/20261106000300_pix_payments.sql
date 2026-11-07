-- v3 · 3 · Pix e controle de pagamento.
--
-- Aditiva (não apaga nem altera dados existentes):
--   * admin_settings  — chave Pix de cada organizador (só o servidor acessa; sem policies);
--   * pix_key_audit   — registro de toda troca de chave (valores mascarados);
--   * rounds.created_by — quem abriu a rodada (define de quem é a chave Pix; rodadas antigas = NULL);
--   * orders.paid_at / paid_by — o organizador marca quem já pagou;
--   * gatilho de orders: marcar/desmarcar pagamento NÃO conta como "pedido alterado"
--     (senão a comanda e os alertas tratariam o pagamento como mudança no pedido).

CREATE TABLE IF NOT EXISTS public.admin_settings (
  admin_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pix_key text,
  pix_key_type text,
  pix_name text,
  pix_city text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_pix_type CHECK (pix_key_type IS NULL OR pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  CONSTRAINT admin_settings_pix_all_or_none CHECK (
    (pix_key IS NULL) = (pix_key_type IS NULL)
    AND (pix_key IS NULL) = (pix_name IS NULL)
    AND (pix_key IS NULL) = (pix_city IS NULL)
  ),
  CONSTRAINT admin_settings_pix_lengths CHECK (
    pix_key IS NULL OR (
      char_length(pix_key) BETWEEN 1 AND 77
      AND char_length(pix_name) BETWEEN 1 AND 25
      AND char_length(pix_city) BETWEEN 1 AND 15
    )
  )
);
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_settings FROM anon, authenticated;
GRANT ALL ON public.admin_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.pix_key_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_key_masked text,
  new_key_masked text
);
ALTER TABLE public.pix_key_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pix_key_audit FROM anon, authenticated;
GRANT ALL ON public.pix_key_audit TO service_role;
CREATE INDEX IF NOT EXISTS pix_key_audit_admin_idx ON public.pix_key_audit (admin_id, changed_at DESC);

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- updated_at só muda quando o PEDIDO muda; mexer apenas em paid_at/paid_by preserva o valor anterior.
CREATE OR REPLACE FUNCTION public.orders_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (to_jsonb(NEW) - 'paid_at' - 'paid_by' - 'updated_at')
     = (to_jsonb(OLD) - 'paid_at' - 'paid_by' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_touch ON public.orders;
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_touch_updated_at();
