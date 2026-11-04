-- Cria o PRIMEIRO administrador. Rode no SQL Editor do Supabase DEPOIS de:
--   1) aplicar as migrações de supabase/migrations/ (cria a tabela public.admins);
--   2) criar o usuário em Authentication > Users > Add user (e-mail + senha, "Auto Confirm User" marcado).
-- Troque o e-mail abaixo pelo e-mail desse usuário. Não há outro caminho para virar admin.

INSERT INTO public.admins (user_id)
SELECT id FROM auth.users WHERE email = 'troque-por-seu-email@exemplo.com'
ON CONFLICT DO NOTHING;

-- Confira (deve listar 1 linha):
SELECT a.user_id, u.email FROM public.admins a JOIN auth.users u ON u.id = a.user_id;
