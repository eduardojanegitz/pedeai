-- v3 · 5 · Pedido concluído: quem prepara/atende marca na comanda ao vivo que o pedido foi concluído.
--
-- Aditiva: uma coluna opcional. Marcar/desmarcar não conta como alteração do pedido (não mexe em
-- updated_at), igual ao pagamento: senão a comanda e os alertas tratariam isso como "pedido mudou".
-- Se o pedido for EDITADO depois de concluído, updated_at passa a ser maior que done_at e a tela avisa.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS done_at timestamptz;

CREATE OR REPLACE FUNCTION public.orders_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (to_jsonb(NEW) - 'paid_at' - 'paid_by' - 'done_at' - 'updated_at')
     = (to_jsonb(OLD) - 'paid_at' - 'paid_by' - 'done_at' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
