-- v3 · 2 · Registro da última impressão da comanda, por rodada.
--
-- Aditiva: uma coluna opcional. O painel compara este instante com orders.updated_at para avisar
-- "alterado após a impressão". Só o servidor (service_role) escreve; nenhuma policy nova.

ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS last_printed_at timestamptz;
