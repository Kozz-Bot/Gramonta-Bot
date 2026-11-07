# Rolês do grupo

`!evento` (também `!role` e `!rolê`) publica o evento nativo do WhatsApp. Presença,
calendário e lembretes ficam nos controles do próprio evento.

```text
!evento Churrasco | 07/11/2026 14h | Casa do João
!evento criar Jantar | 07/11/2026 20:00-23:00 | Restaurante
!evento lista
!evento ver CÓDIGO
!evento editar CÓDIGO Novo título | 08/11/2026 15h | Novo local
!evento cancelar CÓDIGO
```

## Arte de divulgação

Use o comando na legenda da imagem ou respondendo à foto. Com arte, a boundary
consulta os participantes atuais e publica a imagem com menção a todos,
aguarda o ACK desse envio e só então publica o evento nativo. A legenda da arte
inclui título e código do rolê. Sem arte, publica apenas o evento. Nenhum cartão
ou botão adicional do bot é enviado depois do evento. Edição/cancelamento
atualizam o evento original sem repostar a arte nem marcar todos novamente.

Imagens estáticas de até 8 MB e 16 megapixels; PNG/JPEG preservam seus bytes,
outros formatos estáticos aceitos pelo Sharp são normalizados para PNG. URLs
são baixadas como bytes, com timeout e limite de tamanho. Arte citada ausente é
procurada no cache/histórico da origem; se expirada/inválida, é necessário
reenviar antes de publicar. Não é gerada uma arte automaticamente.

O tagAll usa `mentionedList` da mídia com todos os IDs atuais do grupo, como
as marcações invisíveis existentes. O comportamento da notificação no celular
continua sujeito às configurações do WhatsApp do participante.

## Dados e limites

Datas usam `America/Sao_Paulo`, com dia/mês/ano completos. Término menor ou igual
ao início indica o dia seguinte. Sem término, dura duas horas. Aceita até 366
dias no futuro e vinte eventos ativos por grupo. Título até 120 caracteres,
local até 250, ambos em uma linha. Editar/cancelar exige o organizador ou a
conta proprietária do bot. Consultas ficam isoladas por grupo e boundary;
identidades consolidam PN/LID conhecidos pela ZAPO.

`.runtime/role/events.json`, versão 1, diretório 700/arquivo 600, gravação
atômica. Dados inválidos impedem iniciar o módulo sem sobrescrever o arquivo.
Eventos antigos permanecem legíveis, inclusive seus campos históricos de
presença/lembrete; esses campos não são usados nem atualizados. Não há mais
métodos de votação, Google Agenda, exportação `.ics`, consulta de respostas
nativas ou agenda de lembretes do bot. Eventos encerrados há mais de noventa
dias são retirados nas próximas gravações.

O recurso `group_event` envia `eventMessage` e atualiza/cancela com `EVENT_EDIT`
criptografado vinculado ao ID original. Reservas são persistidas em
`kozz_group_events` antes de publicar a arte. Repetições idênticas já concluídas
não reenviam nada; operações pendentes/incertas não são repetidas. Se a arte
chegar e o evento falhar, é exibido um aviso para conferir o grupo antes de
repetir. ACK de submissão não comprova entrega ou leitura. Histórico de sessões,
credenciais e antigas tabelas de respostas são preservados, sem migração
destrutiva. Imagens não são gravadas no arquivo de eventos nem nessa tabela.

## IA e operação

`chat_create_event` é oferecida a qualquer participante no `!ai`, sem confirmação
e exclusivamente no grupo do pedido, preservando arte/tagAll. Não aceita destino.
Exemplo: `!ai crie um churrasco aqui em 07/11/2026 às 14h na casa do João`.

`owner_create_role` pertence ao painel privado.
Recebe `chatId`, `title`, `dateTime`, `location`, valida os dados e o grupo e
apresenta a prévia normal. A imagem anexada/citada é validada e congelada em
bytes antes da prévia; ela informa explicitamente a marcação de TODOS. Só
após aceitar invoca `role.criar`, com os mesmos middlewares. Funciona também
quando o grupo de destino difere do chat do pedido: somente a arte validada é
levada ao destino, sem transportar uma citação de outro chat.

```text
Painel privado: crie um churrasco no grupo Baguncinha em 07/11/2026 às 14h, na casa do João
```

Anexe/cite a arte nesse pedido para incluí-la. A prévia fica no chat de origem;
arte com tagAll e evento vão ao grupo de destino. A ferramenta não aceita URL
ou base64 fornecidos pelo modelo. O módulo também está no catálogo de
`owner_execute_command`; as restrições de comandos e permissões MCP existentes
continuam aplicáveis. A ferramenta dedicada não foi adicionada ao catálogo MCP.

Validar build/TypeScript da aplicação e boundary; testes `role.test.cjs`,
`role-artwork.test.cjs`, `owner-role.test.cjs`, regressões de OwnerAI e na ZAPO
`group-events.test.cjs`, `capabilities.test.cjs` e `bindings.test.cjs`.
Após mudanças, reiniciar `kozz-bot`, `kozz-zapo` e `machine-ai-zapo`, que usam
os artefatos alterados, preservando as sessões.

O proprietário confirmou o uso do evento nativo e seus controles em
2026-10-30. A nova publicação em sequência com arte/tagAll é validada localmente
com transporte simulado; teste dessa sequência no aparelho permanece pendente.

Ativação da revisão em 2026-10-30: builds e TypeScript passaram; 14 testes da
aplicação e 27 da boundary passaram. Reiniciados `kozz-bot`, `kozz-zapo` e
`machine-ai-zapo`, confirmados online posteriormente. O gateway confirmou os
oito métodos atualizados e a ajuda com arte/tagAll. Gramonta com
`connected=true`, `registered=true`, `hasQr=false`. Nenhuma mensagem de evento
ou divulgação foi enviada a um grupo durante essas verificações.

Nome público principal: `!evento`. O módulo interno continua `role` para preservar
catálogos, permissões MCP e integrações existentes. `!role`/`!rolê` continuam
compatíveis; ajuda, validações e prévias da IA mostram `!evento`.
