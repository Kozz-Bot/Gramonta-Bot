# Avisos de novidades

O dono controla os grupos pelo WhatsApp ou pela IA:

- `!ai ative os avisos de novidades neste grupo`
- `!ai quais grupos recebem updates?`
- `!ai procure os grupos Sem Juízo para receber novidades`
- `!ai adicione o grupo de conversa Sem Juízo aos updates`
- `!ai remova este grupo dos avisos de novidades`

Comando `!updates`: `listar`, `buscar NOME`, `adicionar [NOME OU ID]`,
`remover [NOME OU ID]`, `help`. Sem alvo, adicionar/remover usam o grupo atual.
No privado, informe nome/ID. Nomes iguais exigem escolher o ID. Adição consulta
os metadados atuais da ZAPO: aceita grupos comuns, vinculados e de avisos;
recusa comunidades e tipo desconhecido. Remover funciona mesmo se o bot já
não participa do grupo. Cada alteração preserva os demais destinos.

Lista privada persistente em `.runtime/updates/groups.json`, inicialmente vazia,
sem relação com os grupos do `!autostatus`. Apenas o dono pode ler ou alterar.
O atalho de IA permite exclusivamente ao dono configurar essa lista global e
consultar `all_groups`; respostas continuam no chat de origem, sem enviar aviso
durante a configuração. Catálogo e executor recusam participantes comuns; o
handler revalida a identidade. MCP/painel usam o módulo `updates` no executor
existente, com suas permissões de comandos e aprovações preservadas.

Por pedido do proprietário, `Projects/kozz/AGENTS.md` exige um aviso após cada
push do Gramonta ou framework que o afete, depois da ativação. É uma regra para
os agentes deste workspace; não há webhook do GitHub. O agente prepara um resumo
curto e amigável com as novidades e exemplos, ou uma nota de manutenção quando
não há mudança visível. Não publica commits brutos, detalhes privados ou tagAll.
Critério editorial do dono: priorizar o que os outros participantes podem usar
ou perceber; omitir controles exclusivos do host sem interação com os membros e
resumir melhorias técnicas. Uma entrega conjunta de aplicação/framework recebe
um único aviso público para não repetir o resumo nos grupos.
Mudanças específicas de um grupo são anunciadas somente nele, se estiver
cadastrado. Entregas mistas combinam novidades gerais com o trecho exclusivo
de cada destinatário, sem revelar esse trecho nos demais grupos.

No cwd da aplicação, após build/ativação e push:

```sh
node --env-file=.env scripts/announce-update.cjs --repo /CAMINHO/DO/REPO --summary-file /tmp/resumo-novidades.txt
```

Para novidades específicas, use `--group-summaries-file /tmp/resumos-grupos.json`.
O arquivo é um objeto JSON cujas chaves são os IDs `@g.us` dos grupos e os valores
são os respectivos resumos. A seleção persistente continua obrigatória: o mapa
não cadastra destinos. `--summary-file` é opcional nesse modo; sem ele, somente
os grupos do mapa recebem aviso. Com ambos, cada grupo recebe o resumo geral
mais seu próprio trecho, em uma única mensagem de até 3500 caracteres.

O script compara HEAD com a branch de acompanhamento no remoto, consulta a
prontidão do WhatsApp e os tipos atuais dos grupos, e lê a seleção persistente.
Nenhum destino é passado na linha de comando. A lista é revalidada antes de
cada envio. `.runtime/updates/announcements/` guarda uma reserva por hash de
repositório/commit/grupo antes da emissão. Reservas sobrevivem a reinícios e
bloqueiam reenvios, inclusive após interrupção ou falha incerta. Não apagar para
repetir uma operação sem conferir o WhatsApp. Grupos indisponíveis são reportados.
O resultado `forwarded_to_gateway` indica emissão, não entrega no WhatsApp;
`deliveryConfirmed` permanece falso. O resumo não é armazenado nas reservas.

Verificação: build, TypeScript, `node --test --test-isolation=none
test/updates.test.cjs test/chat-commands.test.cjs test/bans.test.cjs` e
`npm run format:check`. Testes usam diretórios temporários e transporte simulado.
Ativação exige reiniciar somente `kozz-bot`; nenhum envio de teste real é necessário.

Ativado em 2026-11-07: build, TypeScript, formatação e 22 testes focados/regressões
aprovados. `kozz-bot` reiniciado e confirmado online após a inicialização dos
handlers. Gateway confirmou `updates` e seus sete métodos, ajuda disponível e
WhatsApp conectado, registrado, sem QR e pronto. Lista real continua vazia;
nenhum grupo foi selecionado e nenhum aviso real foi enviado durante a validação.
