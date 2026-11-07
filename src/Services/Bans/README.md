# Banimento do acesso ao Gramonta

Bloqueio permanente por número, em todos os grupos e no privado. O middleware
`useBans` é instalado antes dos middlewares de grupo/mute em todos os módulos
iniciados pela aplicação, incluindo `!ai` e a execução de comandos pela IA.
Comandos bloqueados são ignorados sem resposta. Não expulsa do grupo, não apaga
mensagens e não bloqueia o contato no WhatsApp. Serviços automáticos e leitura
de histórico continuam com suas regras próprias.

Dados privados em `.runtime/access/bans.json`, fora do Git, com escrita atômica
e permissão 600. A lista é relida em cada comando; alterações não exigem reinício.
Telefone e LID são IDs distintos: forneça os aliases verificados na boundary
para impedir uso pelos dois endereços. IDs com sufixo de dispositivo são
normalizados. Nenhum banimento expira automaticamente.

Somente o dono do bot pode administrar pelo WhatsApp:

```text
!ban @Pessoa --reason Desrespeito às regras
!unban @Pessoa
!banlist
!ban --targetId +5511999990000 --reason Desrespeito às regras
```

Selecione uma pessoa na marcação do WhatsApp. O motivo é obrigatório, até 2000
caracteres. O dono não pode banir a si mesmo. A resposta usa uma menção ao contato.

A consulta `!banlist` mostra contato, motivo e data (Brasília), ou informa que a
lista está vazia. Cada registro é enviado separadamente para preservar o motivo
completo. A lista é exclusiva do dono e aparece no chat em que ele pediu.

A IA pode executar o módulo `ban`, métodos `default` e `unban`, com `targetId`
e `reason` estruturados. No WhatsApp, é uma exceção explícita para o dono às
operações restritas ao chat: o catálogo só o oferece quando `fromHostAccount`
é verdadeiro e o handler revalida essa identidade. Respostas e consultas de
participantes permanecem no chat do pedido. Outros módulos globais continuam
bloqueados. Painel/MCP usam o catálogo e as autorizações/confirmações existentes.
Para consultar pela IA/MCP, use módulo `ban`, método `list`, sem argumentos.
No MCP, é necessária a permissão `ban.list` ou todos os métodos.

Também é possível administrar pelo terminal, na raiz da instância, após o build:

```sh
node dist/Services/Bans/manage.js ban +5511999990000 123456789@lid 'Motivo'
node dist/Services/Bans/manage.js unban +5511999990000
```

O número deve incluir país e DDD. Remover pelo telefone ou por um alias remove
o mesmo registro.
A lista histórica `Handlers/AI/banList.json` estava sem consumidor no código
atual e não é importada automaticamente.

Validação: `npm run build`, `npx tsc --noEmit --pretty false` e
`node --test test/bans.test.cjs`. O teste percorre o executor real dos comandos
com transporte simulado, incluindo grupos/privado, telefone/LID, persistência,
revogação e ausência de respostas ao bloqueado.
