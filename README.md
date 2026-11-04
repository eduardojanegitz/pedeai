# PedeAí!

Cardápio digital interativo (TanStack Start + React + Tailwind + Motion) com banco e fotos no Supabase (hoje via Lovable Cloud).

## Como funciona hoje

- `/` — participante digita o nome (o aparelho guarda um código secreto), escolhe itens, confirma. Pode editar/cancelar até a rodada ser encerrada.
- `/admin` — **Produtos** (categorias, fotos), **Rodadas** (abrir/encerrar; só uma aberta por vez) e **Pedidos** (por participante, ranking, PDF, Excel e texto para WhatsApp).

> Em evolução no branch `feat/pedeai-v2` (login do admin, celular + recuperação, limites por categoria, etapas, horários e animação de conclusão). Os itens abaixo marcados como "ainda" mudam ao longo dessa evolução.

## Desenvolvimento

```sh
npm i
npm run dev      # precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (servidor)
npm run build
npm test
```

Variável opcional no servidor: `RECOVERY_PEPPER` (texto longo e aleatório) reforça o hash dos códigos de recuperação; sem ela usa a `SUPABASE_SERVICE_ROLE_KEY` (trocar essa chave invalida os códigos já emitidos).

O `.env` não é versionado. A `SUPABASE_SERVICE_ROLE_KEY` é injetada pelo Lovable Cloud na publicação e **nunca** vai para o navegador. O lockfile do projeto é o `bun.lock`.

## Banco de dados

- `supabase/setup.sql` — estrutura-base para um projeto Supabase novo.
- `supabase/migrations/` — alterações incrementais, em ordem de nome. Todas são aditivas (não apagam dados). **Rode-as manualmente no SQL Editor do Supabase, na ordem**, depois de revisar. Nenhuma é aplicada automaticamente.

## Segurança (leia)

- O navegador só lê categorias, produtos e rodadas (RLS de SELECT público). Participantes, pedidos e itens só são acessados por funções de servidor.
- O participante é identificado por um código aleatório guardado no aparelho (só o hash fica no banco). Quem limpar os dados do navegador perde o acesso ao pedido anterior (ainda).
- **`/admin` ainda é aberto**: qualquer pessoa com o endereço pode alterar produtos, abrir/encerrar rodadas e ver nomes e pedidos. A autenticação do admin é o Bloco 2 da evolução. Há implicações de LGPD (nomes dos participantes).
- Ainda não há limite de requisições: alguém pode criar pedidos/participantes em massa.

## Publicação e plano gratuito

Publique pelo botão Publish do Lovable (HTTPS e endereço `*.lovable.app`). Confira os limites atuais do plano gratuito do Lovable Cloud/Supabase (banco, armazenamento, tráfego e possível pausa por inatividade) nas páginas oficiais antes de usar em um evento.
