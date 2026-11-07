# Comandos da IA no próprio chat

Exceção autorizada em 2026-11-07: somente o dono pode controlar pelo módulo
`updates` a lista global de grupos que recebem novidades após nossos pushes.
Permite listar/buscar/adicionar/remover, sem enviar avisos durante a configuração.
Somente essa execução revisada recebe a capacidade de consultar `all_groups`;
respostas e demais emissões continuam restritas ao chat original. Participantes
comuns não recebem o módulo no catálogo e são recusados pelo executor e handler.
[Uso e regra de push](../Updates/README.md).

Qualquer participante usa `!ai` ou `/ai` como atalho, sem prévia ou confirmação.
Exemplos: `!ai execute ping aqui`, `!ai me lembra daqui a 30 minutos de beber água`,
`!ai crie um evento aqui: Futebol em 07/11/2026 às 19h na quadra`.
Anexos, citações e marcações do pedido são preservados. Informações ausentes ou
nomes ambíguos ainda exigem esclarecimento.

Ferramentas: `chat_list_commands`, `chat_execute_command`, `chat_find_members`,
`chat_create_reminder`, `chat_create_event`. Elas não aceitam destino ou identidade.
O servidor fixa chat/boundary e preserva remetente, fromHostAccount e middlewares
reais: a IA não concede permissão de proprietário/administrador.
A regra vale também para pedidos do próprio proprietário no WhatsApp.

Revisão de execução e permissões (2026-11-05): o contexto do modelo informa
explicitamente se o solicitante atual é o dono, com base no `fromHostAccount`
recebido da boundary. Nome, texto do pedido e histórico não concedem esse papel.
Recusa de `ban` por falta desse papel tem mensagem própria; a exceção do dono
continua sendo verificada no catálogo, na execução e no handler.
Não foi possível identificar nos registros consultados a tentativa específica
de banimento relatada, portanto sua causa histórica não está confirmada.

Consultar um módulo específico por `chat_list_commands` agora inclui seu recurso
`help`, mesmo em comandos legados sem contrato. A consulta tem prazo de 5 segundos
e limpa o listener ao terminar. `fallback` converte o texto para os campos que o
gateway enviaria, preservando a primeira palavra como método e o restante como
argumento; métodos textuais como signos também são aceitos quando há fallback.
Os atalhos `unban`, `banlist` e `mudos` resolvem para módulo/método canônicos,
assim como `evento` e `rolê`.

Em banimentos, `targetId` é verificado entre as pessoas do chat e convertido
para uma única representação do alvo. Marcações implícitas do pedido não são
acrescentadas junto ao alvo explícito; destinatários explícitos conflitantes
são recusados. O motivo continua obrigatório. Testes usam banimentos temporários
em diretórios isolados, sem alterar pessoas reais.

O log local `ai-usage.jsonl` registra eventos `ai_tool_execution` com ID do pedido,
papel verificado, ferramenta, módulo/método, estado e recusa de validação/permissão,
sem guardar argumentos completos, motivos de banimento ou mídia. Isso permite
distinguir uma recusa do executor de uma resposta do modelo sem execução.

Validação desta revisão: build, TypeScript e formatação aprovados; 32 testes
passaram em `bans`, `chat-commands`, `eightball`, `ai-workflow`,
`owner-ai-handler`, `owner-ai` e `owner-reminder`, com provedores e transporte
simulados. Reiniciado somente `kozz-bot`; nenhum banimento real foi realizado.

Exceção autorizada em 2026-11-04: somente o dono pode usar o módulo `ban` pela
IA para bloquear/liberar acesso global ao bot, com motivo salvo. O catálogo e
a execução verificam `fromHostAccount`, e o handler revalida a identidade.
Consultas de participantes e respostas ficam no chat original. Nenhum outro
controle global foi liberado. [Sintaxe e limites](../Bans/README.md).

`policy.ts` contém os módulos/métodos revisados para operação local. Transmissões,
automações globais, comandos de teste com destino fixo, recursão de `ai` e opções
que atingem outros chats são excluídos. A revisão deve acompanhar cada comando
novo. A limitação não depende só do prompt: `scope.ts` verifica emissões e recursos
por contexto assíncrono, incluindo timers e comandos simultâneos de grupos
diferentes. Recursos de participantes retornam somente membros do grupo atual.
Históricos/citações/nomes são dados não confiáveis, não autorização para agir.

Lembretes criados pela IA têm `localOnly: true` persistido e só possuem entrega
na origem, mesmo após reinício. Não aceitam `--privado` nem ativação posterior
do privado. Alterar pessoas de um lembrete legado com privado ligado exige
desligá-lo primeiro. O comando manual `!lembrete --privado` continua disponível
para lembretes criados manualmente.

Painel web privado e MCP mantêm ferramentas `owner_*`, autorizações, prévias e
concessões separadas. Elas não são oferecidas no `!ai` comum e chamadas inventadas
pelo modelo são rejeitadas pelo conjunto de ferramentas da execução.

Verificar com build, TypeScript e `node --test --test-isolation=none
test/chat-commands.test.cjs test/owner-ai-handler.test.cjs test/owner-reminder.test.cjs
test/lembrete.test.cjs`. Testes usam transporte simulado e agenda temporária.
Boundary: `group-members.test.cjs`. Após build, reiniciar `kozz-bot`; mudanças na
ZAPO exigem reiniciar `kozz-zapo` e `machine-ai-zapo`, preservando sessões.

Ativação em 2026-10-30: build/Babel e TypeScript da aplicação e build da ZAPO
aprovados. Passaram 46 testes focados da aplicação, 20 da boundary e 17 de
regressão painel/MCP. Os testes HTTP foram executados com acesso local liberado,
pois o sandbox bloqueia listen. Reiniciados `kozz-bot`, `kozz-zapo` e
`machine-ai-zapo`, confirmados online após o intervalo de registro. Gateway
confirmou os handlers de IA/evento/lembrete e a ajuda atualizada; Gramonta com
`connected=true`, `registered=true`, `hasQr=false`. Nenhum lembrete/evento real
ou mensagem em grupo foi criado durante a validação; execução testada com
transporte simulado. Sessões e credenciais preservadas.

Desde 2026-10-31, execução de comandos retorna `terminal: false` com recibo e
resultado, permitindo várias etapas no mesmo !ai. `imageRef` opcional seleciona
uma imagem gerada no mesmo pedido para o comando/evento. Repetições idênticas
usam o recibo anterior, inclusive entre ferramentas dedicadas e genéricas.
[Estados, continuação e limites](../AiExecution/README.md).
