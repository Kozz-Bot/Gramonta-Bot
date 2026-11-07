# Pedidos com várias etapas no !ai

Correção de 2026-10-31: ferramentas locais que enviavam uma resposta retornavam
`terminal: true`, encerrando todo o pedido e ignorando outras chamadas do mesmo
lote. Agora comandos locais, imagens, áudios e mensagens de tia devolvem um
resultado estruturado à IA e a execução continua até a resposta final.

Exemplo: `!ai gera uma arte de futebol, cria o evento amanhã às 19h na quadra
usando essa arte e me lembra daqui a 2h de confirmar o pessoal`.
A IA só pode usar funcionalidades realmente presentes no catálogo. Um pedido
com um comando inexistente deve explicar a etapa indisponível; não cria esse
comando nem afirma sucesso. Não há retomada automática após reiniciar o bot.

## Resultados e continuação

`ToolExecutionResult.terminal` fica reservado para fluxos que realmente precisam
parar, como uma aprovação do painel privado. WhatsApp local retorna
`terminal: false`, conteúdo JSON e, para operações, um `ActionRecord`.

- `scheduled`: lembrete persistido, com reminderId.
- `submitted`: envio solicitado/submetido, com eventId quando aplicável;
  não equivale a entrega/leitura no WhatsApp.
- `completed`: resultado funcional informado pelo handler ou CRUD de memória.
- `invoked`: handler terminou sem resultado funcional estruturado; respostas
  textuais limitadas são disponibilizadas para interpretação, sem inventar ACK.
- `failed`: recusado, bloqueado ou validação falhou.
- `uncertain`: pode haver efeito parcial; não repetir automaticamente.

Evento agora publica seu resultado real e código após criar/editar/cancelar;
falha na confirmação nativa fica incerta, sem ser confundida com sucesso.
Cada chamada do lote é processada sequencialmente. Etapas dependentes devem
usar códigos/resultados confirmados; independentes podem continuar após falha.
O prompt exige resumo final do que deu certo e do que faltou.

Em queda do provedor, resposta vazia ou limite de rodadas depois de iniciar
operações, um template local mostra os estados conhecidos. Não afirma que nada
aconteceu nem repete os efeitos. Se o provedor não retornar responseId, o cliente
reenvia contexto inicial, function_call e function_call_output para continuar
com o histórico de ferramentas; o SDK Fuel IX aceita esses itens de replay.

## Repetição e intermediários

`executeOnce` mantém Promises/resultados em WeakMap por requester. Operações
idênticas no mesmo pedido, inclusive chamadas concorrentes, não executam de novo;
rejeições também ficam reservadas. Comandos são normalizados após validação e
resolução de pessoas. `chat_create_event`/`evento.criar` e as formas estruturada/
genérica do lembrete compartilham a mesma operação quando equivalentes.
Consultas `help`/`lista`/`list`/`ver` continuam frescas após alterações.
O retorno `reused` sinaliza reutilização. A deduplicação não é uma comparação
semântica de paráfrases, não persiste entre pedidos e não constitui um job durável.

Até quatro imagens geradas podem receber um `imageRef` opaco. Eventos e comandos
podem escolher essa imagem no mesmo requester, sem passar URL/base64 pelo modelo.
Sem imageRef, anexos/citações originais continuam iguais. Referências de outro
pedido são recusadas. Uma imagem escolhida entra no clone do comando, mantendo
a identidade e chat originais; não altera o requester nem fica disponível a
outros chats. Limites/validações de imagem do handler continuam aplicáveis.

Todos os efeitos ficam no chat de origem, com permissões e middlewares reais.
Painel privado e MCP mantêm suas autorizações/prévias existentes.

## Validação e operação

`npm run build` e `tsc --noEmit --pretty false` na aplicação. Testes:
`ai-workflow.test.cjs`, `fuelix-web-search.test.cjs`, `chat-commands.test.cjs`,
`role.test.cjs`, `owner-role.test.cjs`, `owner-reminder.test.cjs`,
`owner-ai-handler.test.cjs`, `ai-memory-tools.test.cjs`,
`ai-reply-context.test.cjs`, `sticker-background.test.cjs`; também o caso `web AI`
do painel. Provedor, transporte e envios simulados; handlers de evento/lembrete
reais, banco/agenda temporários. Build/TypeScript e 37 testes passaram.
Reiniciar somente `kozz-bot`; não houve alteração na ZAPO/gateway compartilhados.

Ativação em 2026-10-31: reiniciado somente `kozz-bot`, confirmado online após
o intervalo de registro. Gateway confirmou os handlers de IA/evento/lembrete,
a ajuda com múltiplas etapas e o parâmetro de referência de arte gerada.
Gramonta conectado, registrado e sem QR pendente. Nenhum evento, lembrete ou
envio real foi feito para validação; testes usam agendas/bancos temporários,
provedor e transporte simulados. Sessões e credenciais preservadas.
