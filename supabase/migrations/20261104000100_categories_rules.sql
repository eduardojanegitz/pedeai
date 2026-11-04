-- 1/4 · Regras de seleção por categoria. Aditiva: não apaga nem altera dados existentes.
-- Contagem (decisão aprovada): o limite conta OPÇÕES DIFERENTES, não unidades.
-- `allow_quantity` (padrão false) só permite mais de 1 unidade por opção quando o admin habilitar.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS description text CHECK (description IS NULL OR char_length(description) <= 200),
  ADD COLUMN IF NOT EXISTS min_select integer NOT NULL DEFAULT 1 CHECK (min_select >= 0),
  ADD COLUMN IF NOT EXISTS max_select integer NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  ADD COLUMN IF NOT EXISTS allow_quantity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_min_le_max') THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_min_le_max CHECK (min_select <= max_select);
  END IF;
END $$;

-- Valores do cenário inicial, aplicados só às categorias com estes nomes (se existirem).
UPDATE public.categories SET min_select = 1, max_select = 1 WHERE lower(name) LIKE 'prato%principal%';
UPDATE public.categories SET min_select = 2, max_select = 2 WHERE lower(name) LIKE 'acompanhamento%';
