# AutoTramonta

Serviço interno do `kozz-bot`, controlado pelo handler `autotramonta`. Usa a boundary `kozz-zapo` no namespace da aplicação; não cria outro processo PM2. O perfil de escrita está em `style.md`, derivado do descritivo solicitado pelo proprietário.

## Usar no WhatsApp

Abra o chat da própria conta consigo mesma e envie `!autotramonta`. Somente mensagens da conta anfitriã, nesse chat, na boundary Gramonta são aceitas. Os identificadores de telefone e LID autorizados ficam na configuração privada.

1. **Grupos** abre um grupo por cartão, com botões para adicionar/remover, avançar e voltar. Para localizar rapidamente, use `!autotramonta buscar parte do nome`. `!autotramonta grupos` remove o filtro de busca.
2. **Ajustes** oferece predefinições de cadência, duração online/offline e chance de despertar por menção.
3. **Iniciar** ativa a participação apenas nos grupos selecionados. **Parar** cancela gerações pendentes e impede também o despertar por menção.

Todos os botões também mostram o comando equivalente, útil se o cliente não os renderizar. Expiram em 15 minutos; basta abrir o menu novamente. Comandos personalizados:

| Comando                           | Unidade e limites                                          |
| --------------------------------- | ---------------------------------------------------------- |
| `!autotramonta cadencia 45 120`   | mínimo/máximo em segundos, entre 10 e 3.600                |
| `!autotramonta online 5 15`       | mínimo/máximo em minutos, entre 1 e 180                    |
| `!autotramonta offline 15 45`     | mínimo/máximo em minutos, entre 1 e 1.440                  |
| `!autotramonta chance 35`         | inteiro de 0 a 100, por nova mensagem que mencione a conta |
| `!autotramonta status`            | situação e resumo das configurações                        |
| `!autotramonta iniciar` / `parar` | controle geral                                             |

## Comportamento

- Cada grupo tem seu próprio ciclo de participação. Online/offline aqui significa participar ou fazer pausa naquele grupo; não muda a presença global da conta WhatsApp.
- Ao iniciar, cada grupo começa online. Padrões: cadência de 45–120 segundos; janelas online de 5–15 minutos e offline de 15–45 minutos; chance de despertar de 35%. Os tempos são sorteados dentro das faixas.
- Sem mensagem nova de outra pessoa, não há chamada à IA nem envio. Mensagens da conta anfitriã, comandos, eventos duplicados e eventos atrasados mais de dois minutos não disparam respostas. Eventos anteriores ao início do processo não recuperam atividade antiga.
- Risadas, emojis, agradecimentos e confirmações isoladas encerram a rodada em silêncio, sem chamar o provedor. Combinações entre outras pessoas já encerradas por “fechou”, “beleza” e similares também não recebem confirmação da automação. Depois de participar, a IA dá três minutos de espaço para comentários não dirigidos a ela; menções, perguntas diretas e novos esclarecimentos de quem acabou de receber resposta continuam elegíveis. A cadência configurada continua valendo.
- Perguntas reconhecidas sobre quem está respondendo recebem identificação explícita do AutoTramonta. Perguntas sobre chegada, localização, pagamentos e ações pessoais reconhecidas são remetidas ao proprietário, sem inventar confirmações. A saída também passa por uma verificação de afirmações sobre presença ou ações físicas do dono.
- As respostas automáticas recebem um espaço de largura zero (`U+200B`) no final, acrescentado pelo código de envio. O marcador é removido do contexto enviado ao modelo e os ecos dessas respostas não disparam uma intervenção humana.
- Uma mensagem da própria conta sem esse marcador, incluindo texto, comando ou mídia, significa que o proprietário assumiu o grupo. Cancela a geração em andamento, descarta a rodada pendente e coloca somente aquele grupo em pausa pelo intervalo offline configurado, com pelo menos dois minutos desde a mensagem manual. Cada nova mensagem manual recente renova a pausa; duplicatas e eventos antigos não a renovam. O menu mostra **pausado: você assumiu**.
- Menções não interrompem essa pausa. O grupo volta na próxima janela online, respeitando a cadência e a necessidade de novas mensagens de outras pessoas após a intervenção. Os demais grupos mantêm seus ciclos. `!autotramonta parar` continua sendo a parada geral persistente; a intervenção humana é uma pausa temporária por grupo.
- Antes de chamar a IA, a consulta ao histórico também verifica mensagens manuais da conta nos últimos dois minutos, inclusive de antes do início do processo. Isso cobre atividade recente perdida durante reconexões; buffers e pausas anteriores continuam voláteis.
- Uma menção real ao telefone ou LID autorizado pode despertar um grupo durante sua pausa automática, respeitando a chance escolhida. O despertar inicia uma janela online e aguarda a cadência; nunca vence uma parada manual.
- Respostas usam o contexto das últimas 30 mensagens salvas mais o buffer local, limitado a 40 mensagens de até 1.000 caracteres. Esse histórico só é consultado depois de atividade nova. Mídia recebe apenas uma descrição do tipo, sem transcrição ou interpretação automática.
- A IA recebe IDs, autores, horários, mensagens novas e falas anteriores da conta em ordem cronológica. Pode optar por silêncio, uma mensagem ou até três partes curtas quando o ritmo de afirmação/complemento/arremate do perfil justificar. Cada parte tem até 400 caracteres; o conjunto, até 800. Entre partes há pausas de 1,2 a 3,5 segundos, e cada envio mantém seu próprio marcador invisível.
- As últimas 12 mensagens enviadas pela IA ficam em memória separada do recorte de 40 mensagens e também são fornecidas no papel `assistant`. A rodada deve declarar `respondingToMessageIds` apenas entre os IDs novos; perguntas antigas são contexto, não uma fila de respostas pendentes. O serviço guarda até 1.000 IDs respondidos por grupo e bloqueia novas citações de alvos já respondidos. Uma pergunta nova, com outro ID, pode receber uma contribuição nova.
- Frases normalizadas com pelo menos 12 caracteres que repetem uma resposta recente da própria conta são suprimidas por até uma hora (dentro das últimas 12 falas retidas), inclusive sem quote. Saídas com alvos antigos, já respondidos ou ausentes também viram silêncio, sem tentativas repetidas sobre a mesma rodada. Essa proteção é por grupo; a memória é volátil e não altera os bancos WhatsApp.
- A IA escolhe se precisa de quote reply e qual mensagem citar. Só são aceitos IDs de mensagens de outras pessoas presentes no contexto daquele grupo; IDs inventados, falas próprias e entradas sintéticas não produzem citação. A resposta citada usa o evento `reply_with_text` e `quoteId` do framework para gerar o quote nativo do WhatsApp; complementos podem ser mensagens comuns.
- A resposta imediatamente adjacente dispensa quote; complementos não repetem a citação. Quotes ficam disponíveis na primeira parte para desfazer ambiguidade ao responder uma mensagem mais acima. Reações genéricas sem conteúdo não são usadas para prolongar uma conversa que não chamou a IA.
- Parar, remover o grupo, ficar offline, perder conexão ou receber uma mensagem manual entre partes interrompe o restante da sequência. Cada parte enviada é registrada imediatamente para não repetir a primeira em uma tentativa posterior; o contador de envios conta mensagens, não rodadas.
- O modelo pode decidir ficar em silêncio; essa mesma rodada não é reavaliada sem novas mensagens. Mensagens recebidas durante uma geração precedem a resposta enviada e não disparam outra resposta sozinhas.
- Gerações são serializadas. Remover grupo, parar ou mudar configuração invalida gerações anteriores. Ajustar parâmetros preserva mensagens pendentes e a fase dos grupos mantidos. Alterar uma faixa recalcula o prazo correspondente. Adicionar grupo inicia seu ciclo online; remover o último grupo também para o serviço.
- Respeita grupos com comandos desativados e os mutes conhecidos pela aplicação. Não interpreta textos do grupo como comandos de controle do serviço.
- O envio usa a API de mensagens do framework. O contador indica despacho ao gateway, não confirmação de entrega no WhatsApp. Falhas de IA preservam a rodada para tentar novamente na próxima cadência. Antes de enviar, o serviço exige gateway conectado e a última verificação de WhatsApp conectado, registrado e sem QR pendente.

## Configuração e operação

Configuração persistida em `.runtime/autotramonta/config.json` (ignorada pelo Git, arquivo com permissão 600). Contém `ownerIds`, grupos, faixas, chance e estado iniciado/parado. A configuração inicial desta instalação está **parada e sem grupos**. Em um reinício posterior, o estado iniciado/parado é restaurado; buffers e contadores são voláteis e não disparam respostas a partir de backlog antigo.

Em uma nova instalação sem configuração, informe `AUTOTRAMONTA_OWNER_IDS` com os JIDs PN/LID da conta separados por vírgula. Configuração ausente/inválida não é substituída silenciosamente e impede o registro deste handler. Preserve o arquivo privado e os bancos de sessão.

Usa `FUELIX_API_KEY` e `FUELIX_BASE_URL` já existentes. Modelo padrão: `gpt-4.1-mini`, escolhido após comparar as respostas da simulação; o `gemini-2.5-flash-lite` era o padrão inicial. `AUTOTRAMONTA_MODEL` permite substituí-lo sem alterar o modelo dos demais comandos de IA. A chamada tem timeout de 20 segundos, temperatura 0,65 e saída limitada a 500 tokens. O registro de uso existente recebe o evento `autotramonta`, sem conteúdo de conversa ou credenciais, com as quantidades de mensagens e citações escolhidas. Decisões locais de silêncio e respostas fixas de identidade/encaminhamento pessoal não consomem chamada ao modelo.

Após alterações: `npm run build`, `npx tsc --noEmit --pretty false`, `node test/autotramonta.test.cjs`, `node test/autotramonta-menu.test.cjs`, `node test/autotramonta-naturalness.test.cjs`; reinicie somente `pm2 restart kozz-bot` e aguarde o registro escalonado dos handlers. Não é necessário reiniciar ZAPO ou resetar autenticação.

## Incidente de CPU em 2026-10-27

O processo Node permaneceu vivo, mas bloqueou o event loop dentro de
`isAcknowledgement`, identificado pela pilha capturada no processo em execução.
A regex de risadas/confirmações combinava repetições aninhadas e podia entrar em
backtracking exponencial quando uma sequência longa era seguida de outro texto.
Como AutoTramonta, handlers e painel compartilham o processo, `/wpp/` deixou de
responder e os handlers perderam o registro no gateway, apesar do PM2 online.
O WhatsApp permaneceu conectado, registrado e sem QR.

O filtro agora reconhece os mesmos tokens com programação dinâmica, sem
backtracking e com custo linear no comprimento da mensagem. O teste isolado em
subprocesso cobre sequências de até cem mil caracteres, incluindo risadas
válidas e risadas seguidas de texto que precisa continuar elegível para resposta.
O subprocesso tem prazo máximo para que uma regressão não trave o executor de testes.

Build, TypeScript e 46 testes (motor, menu e naturalidade) passaram. Somente
`kozz-bot` foi reiniciado; configuração e autenticação foram preservadas.
Verificações após a recuperação: `/wpp/`, JS e CSS retornaram 200, APIs privadas
mantiveram 401/403, 53 handlers de aplicação voltaram ao gateway (incluindo AI e
ping) e a sessão WhatsApp continuou pronta. A porta temporária do diagnóstico foi
fechada com o encerramento do processo antigo.
