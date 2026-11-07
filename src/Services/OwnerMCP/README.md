# MCP remoto do Gramonta

Endpoint: **https://gramont.digital/wpp/mcp**. Executa dentro de `kozz-bot`, no
mesmo listener de loopback do painel (4890), encaminhado pelo API Gateway e pelo
túnel Cloudflare existentes. Não há nova porta pública ou nova sessão WhatsApp.
`WPP_MCP_ORIGIN=https://gramont.digital`, no ambiente privado da aplicação, fixa
Host, origem, issuer e audience. Sem essa configuração o MCP recusa conexões.

## Conectar

1. No cliente de IA com suporte a MCP remoto e OAuth, adicione o endpoint acima.
2. O cliente registra seu callback e abre a página de autorização do Gramonta.
   Se necessário, entre em `/wpp/` em outra aba, com o login existente pelo WhatsApp.
3. Confira o nome **informado pelo cliente**, seu callback e as permissões.
   Selecione chats, ferramentas e duração de 1, 7 ou 30 dias. Não há seleção
   automática de todos os chats. O backend também aceita prazos inteiros de 1 a 30 dias.
4. Envie o comando `!ai agente CÓDIGO` exibido no chat consigo mesmo.
5. Confira a resposta do bot com cliente, callback, chats, ferramentas, métodos e
   prazo. Envie `!ai agente confirmar CÓDIGO` para conceder o acesso.
6. A janela retorna automaticamente ao cliente, que recebe seus próprios tokens.

O código do WhatsApp não é código OAuth nem access token. Ter somente o código
exibido na tela não permite obter tokens: a janela possui um cookie temporário e
o cliente precisa do verificador PKCE. Uma autorização existente não pode criar
outra autorização na ZAPO. Somente a mensagem real de confirmação, da própria
conta e no chat consigo mesma, pode criar a delegação duradoura do agente.

Clientes públicos usam cadastro dinâmico, `token_endpoint_auth_method=none`,
Authorization Code + PKCE S256 e `resource=https://gramont.digital/wpp/mcp`.
Callbacks devem ser HTTPS; HTTP é aceito somente para loopback do cliente.
Não há busca de URLs de metadata de clientes, callbacks ou provedores informadas
pelo solicitante. Não oferecemos credenciais manuais nem client credentials nesta versão.

## Ferramentas e permissões

| Escopo                 | Ferramentas                                          |
| ---------------------- | ---------------------------------------------------- |
| `whatsapp.read`        | `owner_find_chats`, `owner_chat_history`             |
| `whatsapp.send`        | `owner_send_message`                                 |
| `whatsapp.commands`    | `owner_list_commands`, `owner_execute_command`       |
| `whatsapp.groups`      | `owner_set_group_subject`, `owner_set_group_picture` |
| `whatsapp.automations` | `owner_periodic_posts`, `owner_set_periodic_posts`   |

O cliente pode solicitar esses escopos e `offline_access`. O proprietário pode
reduzir os escopos pedidos. O catálogo MCP expõe apenas as ferramentas concedidas,
mais `owner_action_status`. Cada chamada valida novamente a ferramenta e o chat.
Buscas filtram resultados na ZAPO e na aplicação. História cobre apenas o banco local,
mantendo o limite existente de sete dias por consulta e a paginação.

Desde 2026-11-07, `owner_find_chats` conserva `kind: "group"` e acrescenta
`groupType`: `community` (comunidade), `announcement` (grupo de avisos da
comunidade), `community_group` (grupo vinculado), `group` (grupo comum) ou
`unknown` (metadados insuficientes). `communityId` contém o ID da comunidade
quando conhecido, inclusive o próprio ID para a comunidade; nos demais casos é
`null`. A classificação vem dos metadados ZAPO `isParentGroup`, `defaultSubgroup`
e `linkedParentJid`, nunca dos dígitos do JID, nome ou disponibilidade de histórico.
`announce` sozinho significa envio restrito a administradores e não identifica
um grupo de avisos de comunidade. IDs continuam no formato `@g.us`.
Para ler conversas, selecione o grupo correspondente: consultar a comunidade não
agrega o histórico dos grupos vinculados. Homônimos continuam exigindo resolução
do destino e cada chat mantém suas permissões; conhecer o vínculo não concede
acesso à comunidade ou aos demais grupos.

Validação/ativação de 2026-11-07: 108 testes da ZAPO, seis do MCP HTTP e seis
da IA passaram, assim como os builds e o TypeScript da aplicação. Reiniciados
`kozz-zapo`, `machine-ai-zapo` e `kozz-bot`, confirmados online. Consulta real
somente de leitura ao gateway retornou 33 comunidades, 33 grupos de avisos,
42 grupos vinculados e 240 comuns. No Sem Juízo, comunidade, avisos e conversa
vieram distintos e vinculados ao mesmo `communityId`. Gramonta conectado,
registrado, sem QR e pronto; bancos e credenciais preservados.

Execução de módulos aceita lista explícita `modulo.metodo`, por exemplo
`ping.default`, ou a caixinha **Autorizar todos os métodos**, representada por
`commands: ["*"]`. A opção inclui todos os métodos atuais e os adicionados
futuramente ao catálogo real, preservando a exclusão do módulo `ai` e os
middlewares dos módulos. Com lista explícita, o catálogo retorna somente os métodos
concedidos e o executor recusa os demais. Como módulos e posts periódicos
podem alterar estado global ou outros destinos, esses dois escopos exigem consentimento
explícito para **todos os chats** (`chats: ["*"]`); não são oferecidos como operações
restritas a um único chat. Argumentos, middlewares e restrições dos módulos continuam valendo.

As nove ferramentas privadas do `!ai` são adaptadas do mesmo executor. O MCP não
chama o modelo Fuel IX para decidir o fluxo: essa decisão é do agente externo.
A foto do grupo aceita `source=attached` com `imageBase64` puro (até 8 MB), ou
`source=generate` com `prompt` usando a geração já existente. A imagem é normalizada
e, no modo com aprovação, a prévia humana mostra os mesmos bytes que serão aplicados. URLs e caminhos de
arquivos fornecidos pelo cliente não são aceitos como anexos. Comandos que dependem
de mídias/citações do WhatsApp continuam sujeitos às limitações do executor existente.

## Aprovar e revogar

Por padrão, as alterações geram `status=pending_approval`, `actionId`, prévia, prazo
e `approvalUrl`. Abra `/wpp/` → **Agentes externos** → **Atualizar solicitações**.
Confira os efeitos e clique em Aceitar ou Recusar. Apenas a sessão humana do
painel, com CSRF e nova validação na ZAPO, pode decidir. Não existe ferramenta MCP
de aprovação. Prévias ficam isoladas por agente e não podem ser consumidas pelo
`!ai confirmar`, por outro agente ou por uma aprovação comum do painel.

O agente consulta `owner_action_status({actionId})` para continuar. Estados:
`pending_approval`, `executing`, `completed`, `rejected`, `expired`,
`failed_or_unknown` ou `expired_or_unknown`. `completed` significa que o executor
concluiu a chamada; envios continuam distinguindo submissão de entrega/leitura.
Prévias vencem em cinco minutos e são consumidas antes de executar; não há retry
automático. Reiniciar o bot descarta prévias e estados manuais em memória. Estado desconhecido
exige conferir o WhatsApp antes de uma nova solicitação. Estados concluídos ficam
consultáveis por aproximadamente uma hora após o prazo original da prévia.

Revogue individualmente em **Agentes externos**. `!ai agente sair` ou
`!ai agente revogar`, no chat consigo mesmo, revoga todos os agentes e preserva
as sessões humanas do painel. **Encerrar todos os acessos** no painel e
`!ai painel sair` revogam navegadores **e agentes**. Revogações locais persistem
mesmo se a boundary estiver temporariamente indisponível. Chamadas seguintes são
bloqueadas; uma operação já submetida ao WhatsApp não pode ser desfeita pelo logout.

## Autonomia e todos os métodos no painel

Em `/wpp/` → **Agentes externos** → **Configurar autorização**, selecione:

- **Aprovação das ações:** manter aprovação humana ou permitir execução autônoma.
- **Autorizar todos os métodos:** opção independente, disponível quando o agente
  já possui `whatsapp.commands` e acesso a todos os chats. Ao desmarcar, informe
  novamente a lista de métodos permitidos. Inclui métodos atuais e futuros do catálogo.

A concessão de autonomia, ou de todos os métodos pela primeira vez, exige marcar
**Entendi e autorizo** e digitar **AUTORIZAR** no formulário do agente escolhido.
A sessão humana do painel é revalidada na ZAPO e a rota exige Origin e CSRF.
Não é preciso reconectar para essas alterações. Os escopos OAuth, chats e prazo
absoluto existentes são preservados; ampliar escopos/chats exige uma nova conexão.
Novas conexões e concessões antigas continuam com aprovação por ação por padrão.
Criar a conexão continua exigindo a confirmação inicial no aparelho.

No modo autônomo, enviar mensagem, executar módulo, alterar grupo ou posts executa
imediatamente, respeitando o escopo e o destino concedidos. O agente deve atualizar
`tools/list` depois da mudança: cada ferramenta de alteração passa a exigir
`idempotencyKey`, uma string de 8 a 128 caracteres (`A-Z`, `a-z`, `0-9`, `.`, `_`,
`-`, `:`). Gere uma chave por intenção; ao recuperar um resultado após falha,
repita a mesma chave e os mesmos argumentos. Não gere outra chave para repetir
uma operação incerta. Exemplo de argumentos para `owner_send_message`:

```json
{
	"chatId": "<ID_DO_CHAT_AUTORIZADO>",
	"body": "Texto a enviar",
	"idempotencyKey": "<CHAVE_UNICA_DA_INTENCAO>"
}
```

A aplicação grava um registro antes de executar, sem o texto, a imagem ou os
argumentos brutos: ID, agente, hash da chave, hash da chamada e estado. O resultado
persistido contém somente indicadores de submissão/alteração/invocação, confirmação
de entrega e eventual ID da mensagem. Chamadas repetidas retornam o estado já
registrado, mesmo após reinício; mesma chave com argumentos diferentes retorna
`idempotency_conflict`. Uma execução interrompida fica `failed_or_unknown` e não é
repetida. `owner_action_status` consulta também os registros persistidos.
Isso evita novo despacho pela aplicação com a mesma chave; não transforma ACK em
entrega nem permite desfazer operações já submetidas ao WhatsApp.

Trocar aprovação ou métodos incrementa a versão da política na aplicação e na ZAPO,
invalida prévias pendentes e interrompe os próximos passos de chamadas com versão
antiga. Inconsistência de persistência entre os dois lados bloqueia o agente;
revogue e reconecte se uma mudança não puder ser concluída. Somente credenciais
humanas de navegador podem alterar a política; a própria credencial do agente,
mesmo com todos os métodos, é recusada na ZAPO. Desativar autonomia volta a exigir
aprovação para novas ações. Revogar o agente bloqueia todas as chamadas seguintes.
Uma operação já enviada à rede pode ter acontecido antes da mudança.

## Protocolo e armazenamento

- MCP Streamable HTTP stateless, respostas JSON, protocolos `2025-11-25`,
  `2025-06-18` e `2025-03-26`. `initialize`, `ping`, `tools/list`, `tools/call` e
  notificações de inicialização/cancelamento. GET não oferece stream e retorna 405.
  Cancelamento não desfaz ações já submetidas. Eventos de mensagens novas não
  fazem parte desta versão. A autonomia depende de concessão explícita no painel.
- Discovery público em `/.well-known/oauth-protected-resource/wpp/mcp` e
  `/.well-known/oauth-authorization-server/wpp/oauth`. API Gateway encaminha
  essas duas rotas para o painel. OAuth em `/wpp/oauth/{authorize,token,register,revoke}`.
- Access tokens aleatórios de 256 bits, até dez minutos, vinculados ao recurso,
  cliente, agente, permissões e prazo. `offline_access` permite refresh tokens
  com rotação. Reutilizar um refresh token consumido revoga o agente inteiro.
  Renovação pode reduzir escopos; nunca ampliá-los. O prazo absoluto não se renova.
- `.runtime/owner-mcp/agents.json`: clientes, concessões, hashes de tokens externos,
  metadata mínima da mensagem original, credencial **interna** da ZAPO, modo de
  aprovação, versão da política e registros de idempotência de ações autônomas.
  Diretório 700, arquivo 600, gravação atômica com fsync do arquivo e diretório. Credencial interna não vai ao navegador,
  agente ou modelo. Arquivo inválido bloqueia acesso sem ser substituído.
- Na ZAPO, hashes de delegações existentes em `kozz_owner_ai_web_grants`, com as
  permissões adicionais em `kozz_owner_ai_agent_policies`. Sessão WhatsApp preservada.
  A boundary verifica novamente conta, prontidão, revogação, escopo e chat para
  história, envio e edição de grupo. Tokens de navegador continuam sem permissão
  delegada para editar grupos.
- Auditoria existente: `.runtime/owner-ai/audit.jsonl`, com operações MCP,
  estados e hash do agente/destino; sem corpos, tokens, códigos ou históricos.
  Leituras autorizadas são enviadas ao cliente externo e podem seguir ao provedor
  dele. Históricos, nomes e mensagens não concedem permissões.
- Limites: 60 requisições MCP/minuto por agente e uma operação por agente por vez;
  20 prévias simultâneas no executor compartilhado; até 100 agentes ativos;
  8 cadastros e 20 inícios OAuth/minuto globalmente; 120 trocas de tokens/minuto;
  100 solicitações OAuth em memória; até 10 mil registros de operações autônomas
  no armazenamento compartilhado. Registros são retidos durante a concessão;
  ao atingir o limite, novas operações são recusadas antes de executar. Registros
  de agentes vencidos/revogados são removidos na próxima nova operação. Cadastros sem concessões podem ser removidos
  para manter o limite de 200 clientes; clientes de agentes ativos são preservados.
- HTTPS termina na infraestrutura Cloudflare. Backend continua só em loopback;
  Host e Origin são validados contra a origem fixa. Cookies temporários são
  Secure/HttpOnly/SameSite=Lax; consentimento e polling exigem CSRF. APIs usam
  no-store, CSP sem scripts inline e respostas sem detalhes internos de falhas.
  O API Gateway registra apenas o caminho, sem query, em `/wpp` e discovery OAuth.

## Validar e ativar

Na aplicação: `npm run build`, `./node_modules/.bin/tsc --noEmit --pretty false`,
`node test/owner-mcp.test.cjs`, `node test/owner-mcp-ui.test.cjs` e regressões
`owner-ai`, `owner-ai-handler`, `owner-ai-groups`, `owner-panel`, `owner-panel-ui`,
`fuelix-web-search` e `autostatus`. Testes HTTP precisam de loopback e usam
WhatsApp simulado, sem envios reais. JSDOM verifica fluxos e escape da interface;
não substitui inspeção visual no navegador ou o consentimento real do proprietário.

Compilar também `framework/kozz-zapo` e executar `test/owner-ai.test.cjs`,
`test/messages.test.cjs`, `test/periodic-post.test.cjs`. Compilar API Gateway.
Reiniciar `kozz-bot`, `kozz-zapo`, `machine-ai-zapo` (dist compartilhado) e
`api-gateway`. Conferir processos online, WhatsApp registrado sem QR, discovery
pelo domínio público e MCP recusando falta de autenticação. Não gerar autorização
real do proprietário por simulação, não enviar mensagens de teste nem resetar a sessão.

Ativação em 2026-10-28: builds da aplicação/ZAPO/API Gateway e check TypeScript
passaram, assim como 78 testes focados/regressões. Os quatro processos afetados
foram reiniciados e confirmados online. Pelo domínio público via Cloudflare,
os dois documentos discovery retornaram 200; `/wpp/`, a página OAuth e seu script
retornaram 200; MCP e API de agentes recusaram falta de autenticação (401), e MCP
recusou Origin indevida (403). O gateway confirmou o método `ai.agente` e a
recusa de uma prova inválida de criação de concessão. Gramonta permaneceu conectado,
registrado e sem QR (`ready=true`). A boundary do maquinário continua conectada,
sem registro e com QR (`ready=false`); sua sessão foi preservada. A confirmação
real no aparelho e a conexão por um cliente externo escolhido pelo proprietário
não foram simuladas, e não houve envio de mensagens reais nesses testes.

Referências: [autorização MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
[transporte](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) e
[tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

Atualização em 2026-10-28: controle individual de autonomia e caixinha de todos os
métodos adicionados ao painel; caixinha também disponível no consentimento OAuth.
Concessões existentes não são promovidas automaticamente. Testes cobrem troca
de política, recusa de autopromoção, idempotência após reinício, falhas incertas,
retorno à aprovação e métodos futuros.

Validação desta atualização: builds da aplicação/ZAPO e TypeScript passaram,
assim como 81 testes focados/regressões. O POST de consentimento com `commands: ["*"]`
e seu reenvio foram cobertos para corrigir o `400 invalid_consent` observado
durante a atualização da interface. O formulário passa a validar ferramentas,
chats e métodos antes de enviar, com mensagens específicas. `kozz-bot`, `kozz-zapo`
e `ai-test-zapo` foram reiniciados e confirmados online. O domínio público retornou
200 na página OAuth e recusou falta de autenticação no MCP e na rota de política
(401). O gateway confirmou a recusa de uma tentativa inválida de conceder autonomia.
Gramonta continua registrado, conectado e sem QR; a sessão do maquinário continua
sem registro e com QR, preservada. As solicitações OAuth em andamento foram
descartadas pelo reinício e precisam ser iniciadas novamente no cliente; sessões
humanas e concessões já persistidas foram preservadas. Não houve envio real ou
ativação de autonomia de um agente real por simulação.
