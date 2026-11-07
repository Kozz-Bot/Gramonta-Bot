# Contexto de conversa do !ai

O contexto inicial e `get_chat_context` enviam registros JSON por mensagem:
`id`, `date`, `author.id`, `author.name`, `body` e `replyTo` quando houver citação.
`replyTo` contém a mensagem respondida, o autor, data/texto conhecidos e sua
proveniência/disponibilidade. IDs distinguem pessoas com o mesmo nome e ligam
respostas a mensagens antigas fora da janela recente. A IA recebe orientação
explícita para não assumir que a resposta se refere à linha anterior.

A ZAPO enriquece `recent_chat_messages` e o histórico privado `owner_ai_history`
com resumos textuais das citações. Prefere a mensagem armazenada e sua revisão
mais recente; sem original local, usa o trecho embutido no WhatsApp. Não baixa
mídias, não solicita sincronização e não altera o banco ao resumir citações.
Áudios/imagens antigos são indicados pelo tipo e eventual legenda, sem processar
a mídia automaticamente. Conteúdo/autoria ausentes ficam indisponíveis ou não
identificados, sem inventar data, mensagem ou remetente.

Limites: duas mensagens ancestrais por citação, até 1200 caracteres por texto
citado, detecção de ciclos e indicação de truncamento. O contexto textual tem
até 60 mil caracteres, preferindo os itens mais recentes quando exceder esse
limite. A cadeia direta do pedido tem até 16 mensagens, no mesmo chat.
Mensagens de outros chats não são recuperadas nem expostas por citações.
Históricos e nomes são dados não confiáveis; não autorizam ações da IA.

O pedido atual e sua cadeia direta também incluem identidade e relações de
resposta, inclusive nas partes textuais de mensagens multimodais. Falha ao ler
uma mídia mantém o resumo textual com suas citações. Resumos de mensagens já
presentes nessa cadeia são mantidos no histórico quando trouxerem metadados
mais completos; o mesmo ID identifica a mesma mensagem.

Verificar build/TypeScript da aplicação e build da ZAPO. Testes da aplicação:
`ai-reply-context.test.cjs`, `owner-ai-handler.test.cjs`, `chat-commands.test.cjs`,
`fuelix-web-search.test.cjs`; painel: caso `web AI` em `owner-panel.test.cjs`.
Boundary: `reply-context.test.cjs`, `owner-ai.test.cjs`, `messages.test.cjs`.
Os testes usam mensagens artificiais e transporte/provedor simulado, sem enviar
conteúdo de conversas reais. Depois do build, reiniciar `kozz-bot`, `kozz-zapo`
e `machine-ai-zapo`, preservando bancos e credenciais.

Ativação em 2026-10-30: build/TypeScript da aplicação e build da boundary
aprovados; 14 testes da aplicação, um do painel e 46 da ZAPO passaram (61 no
total). Reiniciados `kozz-bot`, `kozz-zapo` e `machine-ai-zapo`, confirmados
online após o intervalo. Gateway confirmou IA registrada; Gramonta conectado,
registrado e sem QR pendente. Nenhuma conversa real enviada ao modelo ou mensagem
enviada a grupo durante a validação.

## Memória duradoura (2026-10-31)

Além do histórico recente, !ai pode consultar/criar/corrigir/apagar memórias
locais de pessoas e do grupo, automaticamente quando úteis e também por pedido.
A seleção inicial e as ferramentas `chat_memory_*` mantêm escopo/fonte/revisão.
[Persistência, esquecimento e permissões](../../Services/AiMemory/README.md).

## Várias etapas no mesmo pedido (2026-10-31)

Envios e comandos locais retornam resultados para a IA continuar, em vez de
encerrar após a primeira ação. Suporta lotes/sequências, referências a imagens
geradas, resultados funcionais e resumo parcial quando a IA falha.
[Fluxo, estados e limites de repetição](../../Services/AiExecution/README.md).

## Vídeos e mídias sob demanda (2026-10-31)

Anexo e citação direta de vídeo passam a fornecer quadros com horários e
transcrição. `get_chat_media` consulta mídias relevantes do histórico quando
o texto não basta, mantendo autoria, relações de resposta e escopo do chat.
O histórico não baixa mídias automaticamente. A ferramenta fica disponível
somente no !ai do WhatsApp; não amplia permissões de painel/MCP.
[Limites, formatos, exemplos e operação](../../Services/MediaUnderstanding/README.md).
