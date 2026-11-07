# PedeAí!

Cardápio digital interativo (TanStack Start + React + Tailwind + Motion) com banco, login do admin e fotos no Supabase (hoje via Lovable Cloud).

## Como funciona

- `/` — o participante informa nome e celular, escolhe itens **uma categoria por etapa** (cada categoria tem mínimo e máximo), revisa e confirma. Vê a animação de conclusão só depois de o servidor confirmar. Pode editar ou cancelar até a rodada encerrar.
- Cada item escolhido aceita uma **observação** de até 140 caracteres (ex.: "sem cebola"), que aparece na revisão, no painel, nas exportações e na comanda.
- No painel (Pedidos), **alerta sonoro**: som diferente para pedido novo, editado e cancelado, com volume e teste. O painel consulta a rodada a cada 5 s, mesmo com a aba em segundo plano, destaca os pedidos novos e mostra a contagem no título da aba. O navegador só libera o som depois de um clique (botão "Ativar alertas sonoros") e volta a bloquear ao recarregar a página. Sem a aba aberta não há alerta.
- **Imprimir comanda** (Pedidos): modelo consolidado para o estabelecimento (totais por categoria e produto, com observações) ou uma por pessoa. Papéis: térmica 80 mm, térmica 58 mm ou A4. Mostra uma prévia igual ao papel, não inclui celular nem valores a menos que você marque, e avisa quando pedidos mudam depois da última impressão (com atalho para imprimir só os alterados). Usa a impressão do navegador, sem driver especial.
- **Compartilhar a rodada** (Rodadas e Pedidos): link do site, **QR Code** (baixar PNG ou imprimir cartaz A4) e mensagem pronta de WhatsApp com o prazo, editável, com botão "Abrir no WhatsApp". O endereço vem do que está aberto no navegador; se o painel e o site público tiverem endereços diferentes, ajuste na janela (fica salvo no navegador). O QR é gerado no próprio app, sem biblioteca externa.
- **Pedir o de sempre**: quem já pediu em outra rodada vê, no início do pedido, uma faixa para repetir o último pedido em um toque. O pedido é montado com o cardápio de hoje (o que saiu do ar ou passou do limite é avisado) e abre direto na revisão, para conferir antes de confirmar.
- Em outro aparelho, o participante recupera o pedido com o **código de recuperação** (mostrado uma vez). Celular sozinho não prova identidade.
- `/admin` (login por e-mail e senha, só administradores) — **Cardápio** (categorias com regras, produtos, preço, disponibilidade, ordem), **Rodadas** (abertura/encerramento em horário de Brasília, reabrir) e **Pedidos** (filtros, visão consolidada, editados, PDF, Excel, texto para WhatsApp, redefinir código).

## Desenvolvimento

```sh
npm i
npm run dev      # precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (servidor)
npm run build
npm test
```

Variável opcional no servidor: `RECOVERY_PEPPER` (texto longo e aleatório) reforça o hash dos códigos de recuperação; sem ela usa a `SUPABASE_SERVICE_ROLE_KEY` (trocar essa chave invalida os códigos já emitidos).

O `.env` não é versionado. A `SUPABASE_SERVICE_ROLE_KEY` é injetada pelo Lovable Cloud na publicação e **nunca** vai para o navegador.

## Banco de dados

- `supabase/setup.sql` — estrutura-base para um projeto Supabase novo.
- `supabase/migrations/` — alterações incrementais, em ordem de nome. Todas são aditivas (não apagam dados). **Rode-as manualmente no SQL Editor, na ordem**. Nenhuma é aplicada automaticamente.
- `supabase/first-admin.sql` e `docs/ADMIN.md` — como criar o primeiro administrador (desative o cadastro público antes).
- `src/integrations/supabase/types.ts` foi ajustado à mão para as migrações; o Lovable pode regenerá-lo.

## Segurança

- O navegador só lê categorias, produtos e rodadas (RLS de SELECT público). Participantes, pedidos e itens só passam por funções de servidor com a chave de serviço.
- Toda função de admin exige sessão válida **e** linha em `public.admins`; o redirecionamento no navegador é só conveniência.
- Regras do pedido (rodada aberta, produto disponível, mínimo/máximo, versão, repetição de envio) são validadas no banco, em uma única transação (`submit_order`).
- Recuperação: código de 10 caracteres guardado só como HMAC; 5 tentativas erradas bloqueiam por 15 min; a resposta é igual para celular desconhecido, código errado e bloqueio. Limite de requisições por IP (o IP é guardado só como hash).
- Dados pessoais (nome e celular) são visíveis apenas ao administrador e não vão nas exportações. Há implicações de LGPD: informe os participantes e apague os dados quando não forem mais necessários.

## Limitações conhecidas

- Um aparelho ativo por participante: recuperar o pedido em outro aparelho desconecta o anterior.
- Quem perde o código e não está mais logado precisa pedir ao administrador a redefinição.
- Cancelar um pedido não incrementa a versão dele.
- A animação foi testada em navegador de computador; falta testar em celular real de entrada.
- O efeito cinematográfico "produto escolhido voa para o resumo" não foi feito (existe só o efeito simples).
- Horário sempre de Brasília (UTC-3 fixo, sem horário de verão desde 2019).
- Produtos sem categoria não aparecem no cardápio até serem atribuídos.
- Fotos exigem URL assinada (bucket privado), gerada pelo servidor.

## Publicação e planos gratuitos

Publique pelo botão Publish do Lovable (HTTPS em `*.lovable.app`). Limites conferidos em 04/11/2026 (confirme nas páginas oficiais antes de um evento):

- **Supabase (grátis):** 500 MB de banco por projeto, 1 GB de arquivos, 50 mil usuários ativos/mês no Auth. **O projeto é pausado após cerca de 1 semana sem uso** (dados preservados; restaure no painel). Para uso semanal, abra o app antes do evento ou use plano pago.
- **Cloudflare Workers (grátis), se hospedar fora do Lovable:** 100 mil requisições/dia, **10 ms de CPU por requisição** (espera por rede/banco não conta), 128 MB de memória. A renderização no servidor deste app pode se aproximar do limite de CPU: teste antes de depender do plano grátis. O build gera um worker via Nitro (`npx nitro deploy --prebuilt`).
- Volume típico (dezenas de pessoas) fica muito abaixo desses limites.
