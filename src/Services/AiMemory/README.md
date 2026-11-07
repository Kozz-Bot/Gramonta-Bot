# Memórias persistentes do !ai

Atende à decisão do proprietário em 2026-10-31: guardar informações úteis
**automaticamente durante pedidos ao !ai e também quando solicitado**.
Não há monitoramento passivo novo nem importação automática de todo o histórico.
A IA pode memorizar fatos duradouros encontrados no contexto de um pedido:
preferências declaradas, hobbies, aniversário informado, combinados e regras do
próprio grupo. Ela é orientada a não guardar piadas, provocações, suposições,
conversa passageira, segredos ou instruções para executar ferramentas.

Exemplos:

- `!ai guarda que eu prefiro pizza sem cebola`
- `!ai o que você lembra sobre mim?`
- `!ai lembra que nosso encontro habitual é na quinta`
- `!ai corrige minha preferência: agora prefiro sushi`
- `!ai esquece minha preferência de comida`

## Escopo e permissões

Cada memória pertence à combinação namespace/boundary/chat, fixada a partir do
requester real, nunca do modelo. Memórias de uma pessoa em um grupo não viram
memórias globais dela. Não aparecem em outro grupo, no privado ou no painel/MCP.
Ferramentas não aceitam destino, identidade ou host. Painel/MCP preservam suas
autorizações existentes e não recebem essas ferramentas locais novas.

Todos os participantes podem consultar as memórias públicas do próprio chat.
Fatos de grupo são colaborativos; memórias pessoais só podem ser corrigidas ou
apagadas pela própria pessoa, por quem registrou ou pelo dono do bot. Os alvos
são verificados entre participantes reais pelo recurso `group_members`, com
aliases PN/LID. No privado, apenas as identidades do próprio chat são aceitas.
Não se usa nome para conceder autoridade. Permissões de grupo/mute do !ai
continuam se aplicando antes da execução.

Memória nunca concede privilégios nem autoriza enviar comandos futuramente.
Históricos, citações, nomes e textos lembrados são dados não confiáveis para a IA.
Não há confirmação adicional para o CRUD local.

## Ferramentas e recuperação

- `chat_memory_search`: busca lexical sem acentos e listagem paginada;
  filtro `all`, `group` ou `person`. `personId` vazio em `person` significa quem
  pediu. Campos `limit` 1–20 e `offset` 0–1000.
- `chat_memory_get`: leitura por código, incluindo fonte, revisão e `canEdit`.
- `chat_memory_create`: pessoa/grupo, tópico estável ASCII, texto até 800
  caracteres e `sourceMessageId` real. Mesma pessoa/tópico deve ser corrigida;
  duplicatas idênticas retornam o registro existente, sem outra gravação.
- `chat_memory_update`: código/revisão atual/novo texto/fonte. Conflitos de
  revisão exigem nova leitura, sem sobrescrever mudanças concorrentes.
- `chat_memory_delete`: código/revisão; remove texto e fonte do registro ativo.

A mensagem fonte precisa estar no pedido, em sua cadeia de citações ou no
contexto efetivamente consultado pelo bot. O servidor fixa ID/autor/trecho/data
da fonte; o modelo não pode inventar outro remetente ou apontar um ID externo.
A evidência fica em WeakMap por requester, sem virar autorização permanente.
A autoria segue o contexto de respostas já existente. `self_reported` indica
fala da própria pessoa; `reported`, relato de outra; `group`, fato do grupo.
Isso preserva a atribuição, mas não garante que uma afirmação seja verdadeira.

A cada pedido ao !ai, uma seleção de memórias do grupo, de quem pediu/das
marcações e da busca textual entra no contexto (até 9 mil caracteres). A IA pode
consultar outras páginas ou pessoas por ferramentas. Resultados do CRUD voltam
ao modelo, para ele terminar a resposta e confirmar apenas gravações reais.
Não há embeddings, GPU ou chamada extra de IA para recuperar dados.

## Esquecimento e persistência

SQLite nativo do Node (`node:sqlite`, Node 22.13+/24) em
`.runtime/ai-memory/memory.sqlite`, arquivo 600 e diretório 700, fora do Git.
Transações, índices por chat, `secure_delete=ON`, journal DELETE e schema
versionado. Dados inválidos ou schema desconhecido falham sem resetar o banco.
Não toca nos bancos de sessão/credenciais do WhatsApp. Limites: 100 fatos por
pessoa/grupo no chat, 1000 por chat e 50 mil registros ativos no total.

Cada registro guarda fonte, criador, datas e revisão. Ao apagar, texto e trecho
fonte saem da tabela. Um marcador sem esse texto (escopo, aliases, tópico, hash,
ID de origem e data da exclusão) evita que o mesmo fato seja reaprendido do
histórico antigo, inclusive após reiniciar. Uma nova declaração posterior pode
fundamentar uma nova memória. A IA é orientada a não reaprender na mesma
interação o que acabou de ser esquecido. Isso não apaga a mensagem original do
histórico do WhatsApp.

## Operação e validação

Sem dependência npm ou serviço PM2 adicional. Compilar a aplicação, executar
`tsc --noEmit --pretty false` e reiniciar somente `kozz-bot`.
Testes com banco temporário/transporte/provedor simulados:
`node --test --test-isolation=none test/ai-memory-store.test.cjs
test/ai-memory-tools.test.cjs test/ai-reply-context.test.cjs
test/chat-commands.test.cjs test/owner-ai-handler.test.cjs
test/fuelix-web-search.test.cjs`.
Também conferir o caso `web AI` de `owner-panel.test.cjs`.

Medição sintética no servidor: 100 registros, busca mediana 0,25 ms em 50
consultas, SQLite 60 KiB. Não inclui latência do WhatsApp/modelo.
Os testes não gravam informações de pessoas reais nem enviam mensagens.

Ativação em 2026-10-31: build e TypeScript aprovados; 23 testes focados e um
do painel passaram (24 no total). Banco de produção inicializado vazio, sem
backfill de conversas ou dados de teste. Reiniciado somente `kozz-bot`,
confirmado online após o intervalo. Gateway confirmou as cinco ferramentas
`chat_memory_*` e a ajuda atualizada. Gramonta conectado, registrado e sem QR
pendente. Testes de execução da IA usaram provedor/transportes simulados; não
foram enviadas mensagens reais nem informações de conversas ao modelo.
