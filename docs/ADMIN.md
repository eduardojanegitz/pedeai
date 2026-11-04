# Acesso do administrador

Só administradores fazem login (`/admin/login`). Participantes do cardápio não têm conta.

## Criar o primeiro administrador (uma vez)

1. Aplique as migrações de `supabase/migrations/` (cria `public.admins`).
2. No painel do Supabase: **Authentication → Sign In / Providers → Email** e **desligue "Allow new users to sign up"**.
   Assim ninguém consegue se cadastrar por conta própria (a API pública de cadastro passa a recusar).
3. **Authentication → Users → Add user → Create new user**: informe e-mail e uma senha forte e marque **Auto Confirm User**.
4. Edite o e-mail em `supabase/first-admin.sql` e rode o arquivo no **SQL Editor**.
5. Entre em `/admin/login`.

## Como a proteção funciona

- Toda função de servidor do painel (produtos, categorias, rodadas, pedidos, upload de fotos) passa por `requireAdmin` (`src/lib/admin-middleware.ts`):
  valida o JWT do Supabase e confere se o usuário está em `public.admins`. Sem isso, a chamada é recusada no servidor, mesmo que alguém chame a função direto.
- O redirecionamento para o login no navegador é só conforto; não é a barreira de segurança.
- A `SUPABASE_SERVICE_ROLE_KEY` fica apenas no servidor.
- A tabela `admins` não tem política de acesso: só o servidor lê e escreve.

## Adicionar ou remover um admin depois

Crie o usuário em Authentication e inclua o `id` dele em `public.admins` (ou apague a linha para remover o acesso; a sessão dele deixa de valer no servidor imediatamente).
