# Ferramentas privadas do !ai

Regra do proprietário desde 2026-10-30: todo comando novo do Gramonta deve
também ficar disponível para execução pela IA. O registro de módulos iniciados
em `src/index.ts` alimenta o catálogo de `owner_list_commands` e
`owner_execute_command`. Ao criar comandos, verificar não só a presença no
catálogo, mas também a passagem dos argumentos e do contexto necessário
(pessoas, anexos, citações e destino). Quando a execução genérica não cobrir o
comportamento completo, criar ferramenta/adaptação específica. Aplicam-se as
mesmas validações, permissões e middlewares. O WhatsApp comum usa execução
local imediata; painel/MCP preservam suas regras de confirmação e delegação.

Desde 2026-10-30, o `!ai` comum no WhatsApp oferece ferramentas `chat_*` a
qualquer participante, executando sem confirmação e somente no chat de origem.
Isso vale inclusive para a conta proprietária. Consulte
[comandos locais e limites](../ChatCommands/README.md). As ferramentas `owner_*`
descritas abaixo pertencem ao painel privado/MCP, com suas autorizações próprias;
não são oferecidas ao modelo em pedidos comuns do WhatsApp.

`owner_set_group_subject` e `owner_set_group_picture` alteram nome e foto de
grupos a partir de pedidos de agente MCP com
delegação específica e confirmação humana no painel. Não aceitam a origem comum
delegada do painel. A ZAPO verifica escopo e chat na delegação MCP. Consulte
[OwnerMCP](../OwnerMCP/README.md). O destino é pesquisado e validado como grupo. O nome
aceita até 100 caracteres, em uma linha. A foto pode vir da imagem anexada/citada
ou de uma nova geração; é convertida para JPEG quadrado de 640 pixels e mostrada
antes dos botões. Aceitar aplica exatamente essa imagem, sem nova geração.
A ZAPO revalida a origem do aparelho também na operação final. O host precisa
de permissão para editar o grupo. Alterações manuais não desligam agendas.

Se um nome encontrar várias pessoas/grupos, a IA deve pedir esclarecimento.
Datas são consultadas com fuso explícito; se faltar informação necessária, deve
perguntar. O histórico cobre somente o banco local da ZAPO, não todo o WhatsApp.
Uma consulta aceita até sete dias, com páginas de até 200 mensagens/40 mil
caracteres, offsets até 10 mil e indicação de próxima página e textos truncados.
A IA tem até dez rodadas de ferramentas (ou AI_MAX_TOOL_ROUNDS se maior).
Ela deve indicar amostragem ou lacunas em vez de inventar o restante.

## Ações e botões

Envios de texto, execução de módulos e alterações dos posts produzem uma prévia
com destino, conteúdo/argumentos e botões **Aceitar** e **Recusar**. A prévia vence
em cinco minutos. O clique passa pela validação persistida de botões da ZAPO e
por uma nova verificação da conta proprietária. Outros participantes não podem
confirmar nem recusar a ação. Os comandos textuais exibidos junto aos botões são
fallback para clientes sem suporte e passam pelas mesmas verificações.

Cada token só pode ser usado uma vez, no chat original; é consumido antes de
iniciar a operação, inclusive quando ela falha ou fica com resultado incerto.
Não há repetição automática de envios. Prévia e ação ficam vinculadas aos mesmos
argumentos. Há no máximo vinte prévias pendentes. Um reinício do kozz-bot descarta
todas as prévias, mesmo se o botão continuar visível no aparelho.

`owner_set_periodic_posts` controla o mesmo estado/agenda do `!autostatus`.
Ativar um grupo adiciona-o à seleção e liga o serviço global; se outros grupos
já estavam selecionados e parados, eles também retomam. A prévia lista a seleção
resultante. Uma alteração interveniente exige nova prévia. Remover um grupo
não remove os demais nem altera a publicação de Status.

`owner_execute_command` consulta o catálogo dos módulos realmente iniciados e
invoca o método diretamente no processo, usando a mesma função, schema e
middlewares que tratam comandos do gateway. Não existe endpoint de execução
aberto. O módulo `ai` fica fora do catálogo para impedir recursão. Os nomes são
canônicos; aliases do parser não são necessários nesta interface. Os resultados
do módulo vão ao chat de destino. Citações/mídias são preservadas apenas quando
esse destino é o chat do pedido original. Para comandos que dependem de mídia,
anexe/cite a mídia nesse chat. As restrições existentes de cada comando continuam
valendo: por exemplo, controles privados só funcionam no chat consigo mesmo.

`owner_create_role` valida título, data/hora de Brasília e local, resolve o grupo
e prepara `role.criar` (`!evento criar`) para execução após a confirmação normal. Cria rolê com
evento nativo do WhatsApp. Arte anexada/citada é validada e congelada antes da
prévia, que informa a marcação de TODOS no grupo. Após aceitar, envia a arte com
tagAll e depois o evento, inclusive se o destino for outro grupo. Sem arte,
envia somente o evento. Presença, calendário e lembretes ficam nos controles
nativos do WhatsApp. Datas/horários ou locais ausentes exigem esclarecimento. Os métodos `role.editar` e
`role.cancelar` também estão no catálogo; o organizador ou host pode usá-los.
[Detalhes e limites](../../Handlers/Role/README.md).

`owner_create_reminder` agenda `!lembrete` com campos separados `chatId`,
`duration`, `text`, `recipientIds`, `private`. Duração usa `1m`, `3h`, `1h30m`,
etc.; não aceita linguagem natural nesse campo. Pessoas são pesquisadas,
consolidadas por aliases e verificadas como participantes do grupo antes da
prévia. A lista validada é preservada até a confirmação, mesmo se o clique não
contiver marcações ou se o destino for outro grupo. A prévia mostra tempo após
a confirmação, texto, pessoas e aviso privado. Campos não permitem injetar
flags no texto. `recipientIds: []` significa lembrar o criador.

Contratos locais em `contracts.ts` acrescentam descrição, sintaxe e exemplos
ao catálogo filtrado e validam argumentos antes da prévia. `args: {}` continua
significando somente ausência de argumentos nomeados; não descreve o texto de
`immediateArg`. A invocação usa o mesmo módulo/middlewares. Lembrete reporta
o resultado real: `scheduled: true` e código apenas após persistir o
agendamento; rejeições retornam `success: false`, sem mensagem de sucesso e com
auditoria `not_completed`. A resposta do modelo recebe erros de validação
seguros para poder corrigir argumentos antes de pedir confirmação. Demais
falhas continuam sem expor dados brutos, segredos ou stack traces.

## Verificação de identidade

O controle não confia em nome, texto, menção, papel de administrador ou alegação
do modelo. A aplicação verifica `fromHostAccount` e a boundary Gramonta. Antes de
oferecer ferramentas e em cada chamada/confirmação, pede à ZAPO a revalidação do
ID e chat da mensagem original. Esses campos vêm do requester, nunca dos
argumentos que a IA fornece.

A ZAPO exige namespace `default`, boundary `kozz-zapo`, conexão registrada sem QR,
o registro `fromMe` da mensagem e sua origem recebida dos aparelhos em evento
`message` recente (até quinze minutos). Mensagens apenas recuperadas do histórico
ou de citações não são prova suficiente. O controle persiste metadados de origem
na tabela `kozz_owner_ai_origins` da sessão, sem conteúdo. IDs gerados nos envios
do bot são registrados como `bot` ANTES do envio, impedindo que seus ecos recebam
privilégios ou confirmem botões. Nenhuma sessão ou credencial é resetada.
A identidade corresponde à conta e aos aparelhos vinculados a ela.

Históricos, nomes de contatos/grupos, citações e páginas web são dados não
confiáveis para o modelo. Eles não concedem permissões. A confirmação é tratada
por métodos determinísticos do handler, fora do modelo, e não existe ferramenta
de confirmação. Além de ocultar as ferramentas para outras pessoas, o executor
rejeita chamadas que não estavam no conjunto oferecido naquela invocação.

Auditoria local: `.runtime/owner-ai/audit.jsonl`, diretório 700/arquivo 600.
Registra horário, operação, estado e hash do destino; não grava conteúdo da
mensagem, token de confirmação, nomes, credenciais ou histórico. O Fuel IX recebe
os dados consultados para responder, como já recebe o contexto do `!ai`.
Uma submissão com ACK não equivale a entrega/leitura. Os módulos podem iniciar
trabalho assíncrono; a confirmação de invocação não é garantia do resultado externo.

## Validação e operação

Compilar o `framework/kozz-module-maker` (Babel e declarações TypeScript), depois
`framework/kozz-zapo` e a aplicação. Rodar `tsc --noEmit --pretty false` na aplicação.
Testes focados, sem enviar mensagens reais:

- Aplicação: `node test/owner-ai.test.cjs`, `node test/owner-ai-handler.test.cjs`,
  `node test/fuelix-web-search.test.cjs`, `node test/autostatus.test.cjs`.
- ZAPO: `node test/owner-ai.test.cjs`, `node test/messages.test.cjs`,
  `node test/periodic-post.test.cjs`.
- Module maker: `node test/local-command.test.cjs`.

Consumidores ativos: `kozz-bot` e `machine-ai-chatbot` usam module maker;
`kozz-zapo` e `machine-ai-zapo` compartilham o dist da boundary. Reiniciar esses
quatro após as mudanças compartilhadas. O gateway declara a dependência mas não
importa module maker no código executado; não precisa reiniciar por esta mudança.
Após os reinícios, verificar os registros e a prontidão real do WhatsApp
(`connected`, `registered`, sem QR). O teste final dos botões no aparelho requer
um pedido e clique feitos pelo proprietário, pois o próprio bot não pode simular
essa identidade.

Ativação verificada em 2026-10-26: builds e checks TypeScript passaram, assim
como 55 testes focados/regressões. Os quatro consumidores reiniciados ficaram
online. A consulta ao gateway confirmou os métodos `confirmar`/`recusar`,
53 handlers de aplicação no namespace default, Gramonta registrado sem QR e a
recusa de uma prova inválida. O maquinário está conectado, sem registro e com QR
pendente; sessão preservada. Envio real e clique nos aparelhos não foram simulados.

## Central web

Exceção para agentes MCP: o proprietário pode conceder autonomia individual em
Agentes externos → Configurar autorização, permitindo alterações sem prévia humana
por ação. O executor verifica política versionada, escopos e idempotência persistida.
A opção **Autorizar todos os métodos** inclui métodos atuais/futuros do catálogo,
preservando a exclusão de `ai`. As ações normais do painel continuam exigindo confirmação; o `!ai`
comum usa exclusivamente execução local sem confirmação. Consulte [autonomia e limites](../OwnerMCP/README.md).

As mesmas ferramentas e a fila de prévias estão disponíveis em `/wpp/`, com
login autorizado via `!ai painel CÓDIGO` no chat consigo mesmo. A delegação web
valida a mensagem real de autorização na entrada, sem fabricar origem WhatsApp,
e passa a usar uma autorização revogável de 30 dias na ZAPO. Sessões persistem
nos reinícios; a prova curta dos comandos WhatsApp continua limitada a quinze
minutos. As aprovações ficam isoladas por navegador e expiram em cinco minutos.
Use `!ai painel sair` no chat consigo mesmo para encerrar todos os acessos. Consulte [OwnerPanel](../OwnerPanel/README.md).
