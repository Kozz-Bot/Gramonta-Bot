# Lembretes

`!lembrete TEMPO texto` agenda um aviso no chat em que foi solicitado. Tempo é
sempre um parâmetro, sem duração fixa: `30s`, `10m`, `3h`, `2d`, `1h30m`, etc.
Aceita de dez segundos a 365 dias. A agenda é verificada a cada quinze segundos;
o horário mostrado na confirmação usa Brasília (`America/Sao_Paulo`).

`!lembrete` sem argumentos ou `!lembrete help` abre uma ajuda para qualquer
participante, com templates TSX: títulos, espaçamento e exemplos destacados.
Ela explica primeiro como criar um lembrete, depois os tempos, as marcações,
os avisos no privado e como consultar/alterar/cancelar. `CÓDIGO` é explicado
como o código enviado na confirmação. A mesma ajuda é exposta ao menu geral
e ao catálogo da IA.

```text
!lembrete 3h falar com fulano
!lembrete 10m beber água
!lembrete 1h30m reunião --pessoas @Ana @João --privado
!lembrete lista
!lembrete ver CÓDIGO
!lembrete pessoas CÓDIGO @Ana @João
!lembrete privado CÓDIGO on
!lembrete privado CÓDIGO off
!lembrete cancelar CÓDIGO
```

As marcações de exemplo precisam ser escolhidas na interface do WhatsApp;
digitar nomes ou números sem uma menção real não basta. Cada lembrete tem sua
própria lista, de até vinte participantes atuais do grupo. `--pessoas` escolhe
as marcações da lista; sem essa flag, as marcações presentes no pedido são
usadas. Sem nenhuma marcação, a lista contém quem criou o lembrete. Aliases de
telefone/LID conhecidos pela ZAPO são consolidados para evitar duplicação.

No vencimento, o grupo recebe o texto com menções a todas as pessoas da lista.
`--privado` acrescenta uma mensagem individual para cada pessoa, mantendo o
aviso no grupo. Sem a flag, não há mensagens adicionais no privado. Em um chat
privado, o comando simples agenda somente nesse chat; a lista de terceiros e a
flag são reservadas aos grupos. A lista é uma seleção por lembrete, não uma
agenda global de contatos. Alterar a lista substitui a seleção anterior;
`!lembrete pessoas CÓDIGO` sem novas marcações apenas exibe os dados.

Qualquer participante do chat pode consultar os lembretes daquele chat. Somente
o criador ou a conta proprietária do bot pode alterar a lista, ligar/desligar
avisos privados ou cancelar, enquanto os envios ainda não começaram. O primeiro
envio bloqueia mudanças para preservar a lista e o texto efetivamente enviados.
Há no máximo cinquenta lembretes ativos por chat e mil no módulo.

## Persistência e disparo

`.runtime/lembretes/reminders.json`, versão 1, diretório 700/arquivo 600,
gravação atômica e validação de schema antes de iniciar. Armazena texto, origem,
criador, horário, lista e estado de cada destino. Não sobrescreve um arquivo
inválido. Lembretes concluídos/cancelados com vencimento há mais de trinta dias
são retirados nas próximas gravações. Consultas e alterações exigem o mesmo
chat de origem. Usa o nome estável da boundary (`kozz-zapo`), para sobreviver
à troca do ID de socket em reinícios.

O runner exige conexão registrada sem QR e respeita grupos com comandos
desligados e mute do criador. Enquanto esses controles bloqueiam o envio ou o
WhatsApp está offline, os destinos continuam pendentes. Lembretes vencidos são
processados quando o bot volta a ficar disponível; não são descartados pelo
atraso. As configurações são revalidadas após esperas assíncronas, inclusive
para permitir cancelamento antes de iniciar.

Cada destino é reservado antes da chamada à ZAPO. O recurso interno
`send_reminder` também reserva, em SQLite (`kozz_reminder_deliveries`), um ID de
mensagem e hash do conteúdo por sessão/lembrete/destino, antes do envio.
Repetições já submetidas retornam o mesmo resultado. Envios pendentes,
rejeitados ou incertos não são repetidos automaticamente. Se houver reinício
com um destino em andamento, ele vira incerto; os outros destinos pendentes
continuam normalmente. Uma falha no grupo ou em um privado não impede tentar
os demais. Não há garantia de entrega/leitura a partir de um ACK de submissão.

`!lembrete ver CÓDIGO` mostra os resultados individuais: pendente, em andamento,
submetido, falhou ou incerto. Conferir o destino é necessário antes de repetir
manualmente uma mensagem incerta. Não há promessa de entrega exatamente uma
vez: a prevenção de duplicatas pode deixar um destino sem envio confirmado
quando o processo cai durante a operação. A tabela da ZAPO guarda somente IDs,
hash e estado, sem texto ou credenciais.

## Integração e validação

No WhatsApp, todos usam `chat_create_reminder` via `!ai`, sem confirmação,
com duração/texto/pessoas separados. Destino fixo no chat do pedido, sem avisos
no privado. O lembrete persiste `localOnly: true`, bloqueando habilitar o privado
posteriormente, inclusive pelo comando manual. `chat_execute_command` também
expõe os métodos locais com as mesmas permissões do remetente.
[Contrato e testes](../../Services/ChatCommands/README.md).

Registrado no barrel e inicializado com os middlewares usuais do bot. A IA do painel privado
dispõe de `owner_create_reminder`, com campos `chatId`, `duration`, `text`,
`recipientIds` e `private`. Prefira esse caminho estruturado para agendar: ele
valida duração, pessoas pesquisadas e participação no grupo antes da prévia.
A lista fica vinculada à aprovação e é transportada ao handler, inclusive
quando o clique não tem marcações ou o destino é outro grupo. Não existe
agendamento antes de aceitar, e os mesmos middlewares/regras continuam ativos.

Também permanece no catálogo de `owner_execute_command`, agora com descrição,
sintaxe e exemplos para `immediateArg`. A tentativa `criar em 1 minuto ...`
é recusada antes da prévia; o formato é `criar 1m ...`. O comando publica um
resultado explícito de agendamento ou falha; a IA não trata validação rejeitada
como agendamento concluído. Nenhum contato é inventado pelo modelo. Agentes MCP
mantêm somente as permissões anteriores de módulos; a nova ferramenta dedicada
não é oferecida automaticamente a eles.

Checks da aplicação: `npm run build`, `tsc --noEmit --pretty false`,
`node --test --test-isolation=none test/lembrete.test.cjs` e regressões de eventos
e OwnerAI. ZAPO: build e testes `reminder-deliveries.test.cjs`,
`group-events.test.cjs`, `capabilities.test.cjs`, `bindings.test.cjs`.
Após mudanças, reiniciar `kozz-bot`, `kozz-zapo` e `machine-ai-zapo`; os dois
últimos compartilham o mesmo artefato da boundary. Preservar sessões e chaves.

Ativação em 2026-10-30: builds e TypeScript passaram; 17 testes da aplicação e
30 da ZAPO passaram. Reiniciados `kozz-bot`, `kozz-zapo` e `machine-ai-zapo`,
confirmados online após o intervalo de registro. O gateway confirmou os nove
métodos e a ajuda de `lembrete`. Gramonta com `connected=true`,
`registered=true`, `hasQr=false`. Scheduler e envios foram testados com
transporte simulado; não foram criados lembretes reais nem enviados avisos aos
contatos durante a validação. O disparo no aparelho ainda precisa ser testado.

Diagnóstico de 2026-10-30: às 04:51 UTC, no Quintas Intenções, a IA consultou o
catálogo e propôs `!lembrete criar em 1 minuto @Contato ensinar como funcionam
os lembretes`, com `namedArgs: {}`. A confirmação invocou o módulo, que recusou
a duração; nenhum agendamento foi salvo. O catálogo antigo só fornecia métodos
e `args: {}`, sem contrato do argumento textual, e o wrapper tratava a chamada
ao handler como sucesso mesmo após rejeição. Além disso, a execução genérica
usava marcações do clique de confirmação, perdendo as do pedido original.
Correção: ferramenta estruturada, contratos/preflight, snapshot de contatos e
resultado real do handler, com auditoria separada para rejeições. O pedido
antigo não foi reexecutado durante o diagnóstico.

Validação da correção da IA: build/TypeScript e 25 testes passaram, incluindo
reprodução do argumento inválido, handler real invocado pela tooling, clique
sem marcações, grupo de destino diferente, consolidação PN/LID, rejeição por
mudança de participantes e auditoria `not_completed`. Todos os agendamentos
desses testes ficaram em diretórios temporários, com transporte simulado.
Reiniciado somente `kozz-bot`, confirmado online, com o módulo registrado e
Gramonta conectado/registrado/sem QR. A nova ferramenta consta no build ativo.
