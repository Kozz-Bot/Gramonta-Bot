# Publicações periódicas

## Gerenciar envios para grupos

No chat da própria conta consigo mesma, use **`!autostatus`**. O controle aceita
somente mensagens da conta anfitriã na boundary Gramonta e reutiliza os IDs de
proprietário da configuração privada do AutoTramonta.

- `!autostatus grupos` abre os grupos com botões; `!autostatus buscar nome`
  filtra por nome, ignorando acentos.
- Adicione ou remova pelo cartão. Equivalentes: `!autostatus adicionar ID@g.us`
  e `!autostatus remover ID@g.us`. Adicionar verifica a lista atual da boundary;
  comandos repetidos não alternam a seleção. `!autostatus selecionados` permite
  revisar e remover inclusive um grupo que não aparece mais na lista atual.
- `!autostatus iniciar` ativa os envios para os grupos selecionados;
  `!autostatus parar` pausa todos, preservando a seleção. Remover o último grupo
  também desativa os envios. `!autostatus agenda` mostra os horários.

Todos os grupos selecionados recebem as mesmas mídias da agenda de Status, nos
mesmos horários de Brasília: 14 mensagens semanais por grupo. O controle dos
grupos é independente das publicações de Status. O estado inicial é parado e sem
grupos; nenhuma configuração histórica foi importada. Botões também mostram
comandos equivalentes; se expirarem, abra o menu novamente.

A seleção e o estado iniciado/parado ficam em `.runtime/periodic-status/groups.json`
(permissão 600), preservados nos reinícios. Configuração inválida bloqueia os
grupos sem sobrescrevê-la e mantém o agendamento de Status. O agendador aplica
as mudanças na próxima verificação e revalida destinos antes de despachar;
um envio já solicitado ao WhatsApp pode terminar depois de parar/remover.
A janela de recuperação de menos de 15 minutos também vale ao iniciar ou
adicionar um grupo; não dispara imediatamente fora dessa janela. O histórico
por item/data/destino impede duplicação ao parar/iniciar ou remover/adicionar.
Um cancelamento ocorrido durante a reserva fica como falha e não é repetido.

## Incidente em 2026-10-25

**Estado atualizado pelo proprietário:** os Status enviados pelo bot são
visíveis aos contatos, embora não apareçam em “Meu status” na própria conta.
Isso confirma a publicação e a entrega real desses Status. O problema restante
é a exibição/sincronização nos aparelhos do proprietário; não tratar a ausência
na própria lista como prova de falha de publicação. O relato não identifica
qual teste individual foi visto, portanto não atribuir a entrega a uma mudança
específica apenas pelo ACK. O agendamento permanece habilitado.

Os envios de sábado (2026-10-24, 10:00) e de domingo à meia-noite foram
executados pelo agendador, mas rejeitados pelo WhatsApp com
`negative publish ack ... class=message error=400`. Ambos estão registrados
como `failed`; não há confirmação de publicação. Na consulta de diagnóstico,
a sessão estava conectada, registrada e sem QR, e `status_audience_info`
resolveu 5.733 contatos. Esses números descrevem a consulta, não uma garantia
do estado futuro da sessão.

O ZAPO instalado é `1.8.2`. Há um
[relato aberto com a mesma rejeição](https://github.com/vinikjkkj/zapo/issues/253);
a comparação com o fluxo atual de `publishStatusMessage` e o changelog até
`1.10.0` não identificou uma correção confirmada. A causa específica do erro
400 nesta sessão foi isolada em testes autorizados pelo proprietário: o mesmo
vídeo para a própria conta por PN foi rejeitado, e por LID foi confirmado
(`3EB0106DAD86A1DB885B3A`). A seleção automática de público passou a preferir
LIDs sincronizados, mantendo PN somente onde não existe LID conhecido.
O teste com `all_contacts` após a mudança recebeu ACK do servidor em
2026-10-25 às 11:00:46 UTC (08:00:46 em Brasília), com 5.734 destinatários e
messageId `3EB027AA95BDDAE12B0FEE`. O registro `manual-lid-test@...` em
`.runtime/periodic-status/` está como `sent`; os registros anteriores de falha
foram preservados. O proprietário inicialmente informou que esses Status não
apareciam em “Meu status” e depois confirmou que os contatos conseguem vê-los.
`sent` nesse histórico significa
somente que o servidor aceitou a requisição, não que o celular mostrou a publicação.

O Status manual publicado pelo proprietário às 08:06 de Brasília foi recebido
normalmente pela boundary (`ACCE6A700B5FE1A072402CCB581125BE`). Os testes do bot
com vídeo e imagem, restritos à própria conta, receberam ACK mas não apareceram.
O diagnóstico confirmou destinos para os aparelhos próprios 0 (principal) e 48;
o envio nativo distribuía somente a chave nesses destinos. Foi testada uma cópia
completa `deviceSentMessage` do conteúdo e da distribuição aos próprios aparelhos,
preservando o envio nativo aos contatos. O teste de imagem às 08:12:38
(`3EB0D12F1F08FFE88907C0`) recebeu ACK, mas o proprietário confirmou que também
não apareceu. Esse ajuste foi retirado. O teste de `addressing_mode=lid` às
08:15:36 foi rejeitado com ACK 479 (`3EB02ED662424403A582A0`), e também foi
retirado. Nenhum dos dois experimentos deve ser tratado como correção.

O fluxo ativo usa o envio nativo ZAPO com público LID e o plugin de diagnóstico
`framework/kozz-zapo/src/status-diagnostics.ts`. A nova publicação manual
`AC604168696A615F69BD8E96985A629D` chegou às 08:21:42 como `skmsg`, sem
`deviceSentMessage`, com `meta status_setting=denylist`. O bot havia usado
`contacts`. O teste com `denylist` às 08:22:35
(`3EB0DAD61295D5300A99E9`) recebeu ACK. O relato posterior confirma a entrega de
Status do bot aos contatos, mas a própria lista continua sem mostrar os envios.

A consulta somente leitura da privacidade (`xmlns=status`, `privacy`) confirmou
modo padrão `blacklist`, com 16 exclusões. A boundary agora consulta esse modo
em cada publicação, traduz `blacklist` para `denylist` e `whitelist` para
`allowlist`, e aplica as exclusões/seleções à lista de contatos consolidada.
Não chama a mutação de privacidade. `status_privacy_info` expõe somente modo e
contagens. Build e testes locais passaram. A entrega foi confirmada pelo relato
do proprietário sobre a visualização pelos contatos; a exibição em “Meu status”
continua pendente.

Os logs `[StatusTransport]` distinguem `publish`, `server_ack`, `self_copy` e
`receipt`/`receipt_stanza`. Registram somente metadados de transporte, sem mídia
ou chaves. Não declarar o incidente resolvido apenas por `server_ack`.

Inicialização em `src/index.ts`, via `startPeriodicStatus()`. O catálogo aponta para
`media/saved/periodic/` e `createMediaSchedule(destinations)` monta os horários dos
nomes dos arquivos. `statusSchedule` está ativo somente para Status, com
`{ kind: 'status', audience: 'all_contacts' }`.

| Mídia                 | Periodicidade (Brasília)                       |
| --------------------- | ---------------------------------------------- |
| everyday-at-00:00.mp4 | Todos os dias, 00:00                           |
| monday-noon.png       | Segunda, 12:00                                 |
| Tuesday-11AM.png      | Terça, 11:00                                   |
| wednesday-4PM.mp4     | Quarta, 16:00                                  |
| thursday-11AM.jpeg    | Quinta, 11:00                                  |
| friday-10AM.mp4       | Sexta, 10:00                                   |
| saturday-10AM.mp4     | Sábado, 10:00, apenas os primeiros 90 segundos |
| sunday-11:18PM.jpeg   | Domingo, 23:18                                 |

A publicação diária à meia-noite soma-se à mídia específica de cada dia: 14 itens
semanais. O recorte de sábado é feito em arquivo temporário com FFmpeg e não
modifica o original. Não são publicadas partes adicionais do vídeo.

## Agenda e conteúdos

- `statusProviders`: catálogo de funções identificadas por `statusId`. Cada função
  recebe a data local e o item da agenda, e produz `{ body, media? }`. Permite textos
  em templates TSX, mídia e geração dinâmica. `media` segue o tipo `Media` do Kozz,
  com `transportType: 'b64'` ou `'url'`.
- `statusSchedule`: lista de `{ weekday, time, statusId, destinations }`.
  `weekday` vai de 0 (domingo) a 6 (sábado); `time` usa `HH:mm`, sempre em
  `America/Sao_Paulo`. Permite vários itens no mesmo dia, cada um com horário
  próprio. Combinações repetidas de dia, horário e conteúdo são rejeitadas.
- `destinations` aceita `{ kind: 'status', recipients: [...] }` e
  `{ kind: 'status', audience: 'all_contacts' }`, além de
  `{ kind: 'group', chatId: '...@g.us' }`. Um item pode ter ambos os tipos e vários
  grupos. Cada item é publicado uma vez por data/destino. Destinos duplicados no
  mesmo item são rejeitados. A agenda fixa prevê Status; o menu `!autostatus`
  acrescenta os grupos selecionados enquanto os envios estiverem iniciados.
- Status usa a publicação nativa do WhatsApp, que expira em 24 horas. O público
  `all_contacts` é resolvido na boundary em cada publicação: contatos com nome salvo
  no cadastro sincronizado da sessão, excluindo nomes de perfil isolados e nomes
  de telefone mascarados. Consolida telefone/LID, prefere o LID sincronizado e exclui bloqueados, a própria
  conta e grupos. Aplica também as exclusões ou seleções da privacidade de Status
  consultada no servidor. A sessão não mantém uma flag própria de agenda; a presença do
  nome salvo é o indicador disponível no cadastro atual.
  Também permite público explícito (`@s.whatsapp.net` ou `@lid`). Não altera a
  configuração global de privacidade da conta. Grupos usam mensagens comuns, sem
  expiração imposta pelo serviço; a seleção é controlada por `!autostatus`.
- Texto, imagem, vídeo e áudio são aceitos no Status. Grupos aceitam também
  documentos. Mídias devem estar nos formatos suportados pelo WhatsApp/ZAPO.

O serviço valida a configuração antes de abrir conexão. Com a agenda vazia, apenas
registra uma mensagem no log; não cria socket nem temporizador.

## Execução e histórico

O agendador verifica o horário ao registrar o módulo no gateway e a cada minuto.
Se o bot ficar indisponível, recupera apenas o item de hoje atrasado em menos de
15 minutos. Não envia um acúmulo de dias anteriores. Só prepara o conteúdo depois
de confirmar WhatsApp conectado, registrado e sem QR pendente.

O conteúdo é preparado uma vez por execução e distribuído aos destinos pendentes
por `module.ask.boundary('kozz-zapo', 'publish_periodic_post', payload)`.
A boundary confirma a publicação com o identificador da mensagem após a resposta
do WhatsApp; isso não confirma leitura nem visualização por cada destinatário.

Arquivos em `.runtime/periodic-status/` registram data, conteúdo, horário, destino e estado
(`sending`, `sent`, `failed`), sem guardar o texto ou os bytes da mídia.
A reserva exclusiva de data/publicação/destino acontece antes da publicação. É preservada
após reinícios e impede duplicação inclusive se a confirmação se perder.
Por isso uma falha depois da reserva não gera nova tentativa automática naquele
item/data/destino; exige inspeção do histórico antes de qualquer reenvio manual.
Falhas anteriores à reserva (preparação do conteúdo ou conexão indisponível)
podem ser recuperadas na próxima verificação dentro da janela de 15 minutos.

`Handlers/PeriodicPosts` foi retirado do registro de handlers. Seu código e
`gropuDB.json` foram preservados como histórico; os agendamentos antigos, que
apontavam para Baileys, não foram importados.
