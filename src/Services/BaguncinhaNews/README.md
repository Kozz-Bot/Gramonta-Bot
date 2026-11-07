# Notícias do Baguncinha

Reativado a pedido do proprietário em 2026-10-27. Dentro de `kozz-bot`, o módulo
`baguncinha-news` inicia uma rodada diária às **10:30** e **19:00**, no fuso
**America/Sao_Paulo**, confirmado pelo proprietário. Pesquisa e geração começam
nesses horários; a aplicação depende do tempo de resposta dos provedores.

Destino fixo: `120363145764693476@g.us`, identificado pelo nome
“Baguncinha: Apuração começou!” e por 6.243 mensagens nos últimos sete dias.
Os outros três grupos com Baguncinha no nome tiveram zero mensagens no período.
O destino não é redescoberto pelo novo nome nem muda para outro grupo.

Cada rodada usa a pesquisa nativa `web_search` do Fuel IX para comparar os
destaques do Brasil e do mundo. Só prossegue com pesquisa concluída, notícia de
até dois dias e URLs de fontes. O modelo cria `Baguncinha: {piada}`, com até
100 caracteres e relação concreta com a notícia, e a descrição de uma charge
da mesma piada. Evita repetir os oito nomes anteriores. A imagem usa o gerador
já configurado do bot, normalizada como JPEG quadrado de 640 pixels.

Antes de gerar a imagem, compara semanticamente a notícia escolhida com o tema
atual. Consulta o nome real do grupo na ZAPO e usa o resumo da notícia do histórico
somente quando ele corresponde a um nome efetivamente aplicado. Sem esse histórico,
infere o tema pelo nome atual. Outra piada, manchete ou desdobramento do mesmo
acontecimento contam como mesmo tema; uma categoria ampla em comum não basta.
Se for o mesmo tema, registra a rodada como ignorada e preserva nome e foto,
sem gerar imagem ou tentar outro tema nessa rodada. Essa decisão persiste nos
reinícios. Nome atual indisponível ou comparação inconclusiva/falha bloqueiam a
alteração, com as tentativas normais. A comparação tem limite de 60 segundos e
depende da interpretação do modelo.

O histórico privado fica em `.runtime/baguncinha-news/YYYY-MM-DD-HHmm.json`,
com fontes, data, nome, prompt, imagem e progresso. Não versionar. A prévia
manual de validação fica em `preview.json` e não é uma publicação agendada.
São até três tentativas por horário dentro de quinze minutos; atrasos maiores
e dias anteriores não são recuperados. Sem WhatsApp conectado, registrado e sem
QR, não altera o grupo. Geração completa e persistência vêm antes das alterações.
Falhas antes da geração preservam o grupo. Nome e foto são duas operações do
WhatsApp: se a foto falhar após o nome, a próxima tentativa reaplica apenas a
foto já gerada. Um crash entre ACK e gravação pode repetir a mesma alteração,
sem gerar outro conteúdo. O bot precisa de permissão para editar os dados do grupo.

A agenda executa automaticamente, autorizada pelo proprietário. Pedidos manuais
de troca de nome/foto pelo `!ai` usam suas próprias prévias e confirmações e
não desligam esta agenda. Pesquisa tem limite de 180 segundos; geração, 240;
download, 60. Testes: `node test/baguncinha-news.test.cjs`, depois do build.

Ativação em 2026-10-27: builds da aplicação/ZAPO e check TypeScript passaram,
assim como os testes da agenda, recuperação de falhas, novas ferramentas do
host e regressões de autorização/pesquisa. Pesquisa e geração reais produziram
uma prévia local sem alterar o WhatsApp. Reiniciados `kozz-bot`, `kozz-zapo` e
`ai-test-zapo` (consumidor do mesmo dist). Agenda confirmada nos logs; Gramonta
conectado, registrado e sem QR. As novas operações privadas rejeitaram prova
inválida em consulta real. Não foi simulada confirmação do proprietário nem
forçada uma alteração fora do horário.

Comparação de temas ativada na mesma data: build, TypeScript e os 12 testes do
serviço passaram. Validação real do modelo distinguiu duas piadas sobre o mesmo
acontecimento de uma notícia diferente, sem gerar imagem nem alterar o WhatsApp.
Reiniciado somente `kozz-bot`; processo online e agenda confirmada nos logs.
