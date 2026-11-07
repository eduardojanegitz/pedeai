-- v3 · 4 · Link do estabelecimento: página só de leitura com a comanda ao vivo, sem login.
--
-- Aditiva. O link carrega um token aleatório de 256 bits; AQUI só fica o hash (SHA-256), então
-- um vazamento do banco não entrega links utilizáveis. Cada link tem prazo e pode ser revogado.
-- Só o servidor (service_role) acessa; sem policies.

CREATE TABLE IF NOT EXISTS public.board_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT board_links_token_hash_len CHECK (char_length(token_hash) = 64),
  CONSTRAINT board_links_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS board_links_round_idx ON public.board_links (round_id, created_at DESC);

ALTER TABLE public.board_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.board_links FROM anon, authenticated;
GRANT ALL ON public.board_links TO service_role;
