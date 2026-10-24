# Publicações periódicas

Inicialização em `src/index.ts`, via `startPeriodicStatus()`. O catálogo aponta para
`media/saved/periodic/` e `createMediaSchedule(destinations)` monta os horários dos
nomes dos arquivos. `statusSchedule` está ativo somente para Status, com
`{ kind: 'status', audience: 'all_contacts' }`.

| Mídia | Periodicidade (Brasília) |
| --- | --- |
| everyday-at-00:00.mp4 | Todos os dias, 00:00 |
| monday-noon.png | Segunda, 12:00 |
| Tuesday-11AM.png | Terça, 11:00 |
| wednesday-4PM.mp4 | Quarta, 16:00 |
| thursday-11AM.jpeg | Quinta, 11:00 |
| friday-10AM.mp4 | Sexta, 10:00 |
| saturday-10AM.mp4 | Sábado, 10:00, apenas os primeiros 90 segundos |
| sunday-11:18PM.jpeg | Domingo, 23:18 |

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
  mesmo item são rejeitados. A configuração atual prevê somente Status; nenhum
  grupo foi selecionado.
- Status usa a publicação nativa do WhatsApp, que expira em 24 horas. O público
  `all_contacts` é resolvido na boundary em cada publicação: contatos com nome salvo
  no cadastro sincronizado da sessão, excluindo nomes de perfil isolados e nomes
  de telefone mascarados. Consolida telefone/LID e exclui bloqueados, a própria
  conta e grupos. A sessão não mantém uma flag própria de agenda; a presença do
  nome salvo é o indicador disponível no cadastro atual.
  Também permite público explícito (`@s.whatsapp.net` ou `@lid`). Não altera a
  configuração global de privacidade da conta. Grupos usam mensagens comuns, sem
  expiração imposta pelo serviço; nenhum grupo foi habilitado.
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
