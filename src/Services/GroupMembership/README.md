# Mensagens de entrada e saída

`messages.tsx` contém um mapa por ID `@g.us` de templates JSX `join`/`leave`.
Cada template recebe `{ group, member }`, com os dados atuais do grupo e da
pessoa. O texto da Laís está configurado para `120363411230167560@g.us`: o nome
do grupo vem de `group.name` e a marcação de `member.id`. Saída não configurada.

`index.ts` mantém o módulo ativo e escuta os eventos de entrada/saída da ZAPO.
Se houver template para o ID e a ação, busca os detalhes do grupo e envia uma
mensagem por membro. Sem banco, fila, deduplicação própria ou filtro por horário.
Para adicionar outro grupo ou mudar o texto, edite o mapa JSX, compile a aplicação
e reinicie `kozz-bot`.

Validar com `npm run build`, `./node_modules/.bin/tsc --noEmit --pretty false` e
`node --test --test-isolation=none test/group-membership.test.cjs`. Os testes
usam transporte simulado, sem enviar mensagens reais. O banco da versão anterior
não é mais lido nem escrito pelo serviço.

Versão simplificada ativada: build, TypeScript e dois testes aprovados. `kozz-bot`
reiniciado e online; assinatura dos eventos de entrada e prontidão do WhatsApp
confirmadas por leitura no gateway, sem disparo manual de mensagem no grupo.
