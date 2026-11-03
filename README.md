# Cardápio Digital — MVP

Cardápio interativo (TanStack Start + React + Tailwind + Motion) com banco e fotos no Lovable Cloud (Supabase).

## Como funciona

- `/` — participante digita o nome (o aparelho guarda um código secreto), escolhe itens, confirma. Pode editar/cancelar até a rodada ser encerrada.
- `/admin` — **Produtos** (categorias, fotos), **Rodadas** (abrir/encerrar; só uma aberta por vez) e **Pedidos** (por participante, ranking, PDF, Excel e texto para WhatsApp).

## Desenvolvimento

```sh
npm i
npm run dev      # precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (servidor)
npm run build
npm test
```

O `.env` tem apenas chaves públicas. A `SUPABASE_SERVICE_ROLE_KEY` é injetada pelo Lovable Cloud na publicação e **nunca** vai para o navegador.

## Segurança (leia)

- O navegador só lê categorias, produtos e rodadas (RLS de SELECT público). Participantes, pedidos e itens só são acessados por funções de servidor.
- O participante é identificado por um código aleatório guardado no aparelho (só o hash fica no banco). Quem limpar os dados do navegador perde o acesso ao pedido anterior.
- **`/admin` é aberto**: qualquer pessoa com o endereço pode alterar produtos, abrir/encerrar rodadas e ver nomes e pedidos. Esconder a rota não protege. Use só internamente e por pouco tempo; para uso público, adicione um "código do admin" conferido no servidor. Há implicações de LGPD (nomes dos participantes).
- Não há limite de taxa: alguém pode criar pedidos/participantes em massa.

## Publicação e plano gratuito

Publique pelo botão Publish do Lovable (HTTPS e endereço `*.lovable.app`). Confira os limites atuais do plano gratuito do Lovable Cloud/Supabase (banco, armazenamento, tráfego e possível pausa por inatividade) nas páginas oficiais antes de usar em um evento.
