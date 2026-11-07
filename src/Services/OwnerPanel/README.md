# Central web do Gramonta

Acesso externo: `/wpp/`, na origem **HTTPS** gerenciada pela infraestrutura.
`/wpp` redireciona para `/wpp/`. O API Gateway da porta 8000 encaminha a rota
para `127.0.0.1:4890`. O painel executa dentro do processo existente `kozz-bot`;
não há outro processo PM2 nem porta pública nova. A porta interna pode ser
alterada com `WPP_PANEL_PORT`, mantendo o destino do proxy correspondente.

## Entrar

1. Abra `/wpp/` no navegador e clique em **Autorizar pelo WhatsApp**.
2. Envie para você mesmo o comando `!ai painel CÓDIGO` exibido.
3. Volte ao navegador. Ele conclui o login automaticamente.

O login também aceita `!aí painel CÓDIGO` quando o corretor do celular acrescenta
o acento; a validação usa a mesma normalização do parser de comandos.

Só a própria conta, no chat consigo mesma, pode conceder acesso. Não use códigos
de navegadores abertos por outra pessoa. O código vence em cinco minutos. A
sessão vale **30 dias corridos a partir da autorização**, sem renovação automática.
A mensagem do aparelho é validada na entrada, e a ZAPO emite uma autorização
própria do navegador, vinculada à conta autenticada e com a mesma expiração.
A prova curta de quinze minutos continua valendo para comandos comuns do WhatsApp.

As sessões sobrevivem aos reinícios do bot e da ZAPO. Códigos de entrada,
conversas web e prévias pendentes continuam em memória e são descartados ao
reiniciar. Os acessos antigos de quatorze minutos não são promovidos: entre
uma vez novamente para receber uma sessão de trinta dias.

**Sair da central** revoga apenas o navegador atual. **Encerrar todos os acessos**
revoga todos os navegadores; também pode ser feito enviando `!ai painel sair`
(ou `!ai painel revogar`) no chat consigo mesmo. A revogação local é persistida,
invalida as prévias e bloqueia chamadas ainda em andamento antes da próxima
ferramenta. Se a ZAPO estiver indisponível, o logout web continua removendo a
sessão local; a autorização da boundary não pode mais ser usada pelo painel.

O endereço externo deve manter seu Host original ao passar pela infraestrutura
até o API Gateway (`changeOrigin: false`). A origem é comparada com
`https://Host` e a sessão fica vinculada a ela. O backend recebe HTTP apenas no
loopback; o TLS termina na infraestrutura, conforme orientação do proprietário.
Cookies são sempre Secure: o endereço HTTP direto do servidor não permite login.
Não há necessidade de expor a porta 4890 ou de habilitar CORS.

## Recursos

- **Agentes externos:** endpoint MCP remoto, lista de concessões, permissões,
  expiração, revogação individual e prévias dos agentes. A autorização OAuth exige
  consentimento no navegador e confirmação em duas etapas pelo WhatsApp. Consulte
  [OwnerMCP](../OwnerMCP/README.md). Encerrar todos os acessos também revoga agentes;
  sair de apenas um navegador preserva as concessões dos agentes.
  Em **Configurar autorização**, é possível habilitar execução autônoma sem
  aprovação por ação e marcar **Autorizar todos os métodos** (atuais e futuros).
  O modo autônomo e a ampliação para todos os métodos exigem confirmação explícita
  no formulário. A sessão humana é revalidada na ZAPO; o agente não pode promover
  sua própria autorização. Desmarcar todos os métodos permite definir uma lista.
  Essas mudanças preservam escopos/chats/prazo e invalidam prévias anteriores.

- **Visão geral:** módulos, grupos selecionados, ações pendentes e estado real
  de conexão/registro da sessão WhatsApp (sem QR ou credenciais).
- **Assistente IA:** conversa pelo Fuel IX usando as ferramentas privadas já
  existentes. As respostas ficam no painel. Geração de imagem/áudio e mensagem
  de tia ficam disponíveis pelo WhatsApp; o painel oferece ferramentas de texto,
  pesquisa web e gestão. O histórico padrão do chat de login não é enviado ao
  modelo. A conversa web fica na memória da sessão, limitada a doze mensagens.
- **Chats e histórico:** pesquisa de contatos/grupos, mensagens locais por
  intervalo de até sete dias, paginação e preparação de envios de texto.
  Datas são convertidas do horário do navegador para ISO com fuso explícito.
- **Posts periódicos:** seleção de grupos, remoção, pausa e retomada, compartilhando
  o estado do `!autostatus`. Adicionar e ativar um grupo pode retomar os demais
  previamente selecionados; a prévia lista os destinos resultantes.
- **Comandos:** catálogo real dos módulos/métodos iniciados, campos conforme seus
  schemas e seleção do chat de destino. Módulos mantêm validação e middlewares.
  Seus resultados aparecem no WhatsApp de destino; comandos de mídia devem ser
  executados no WhatsApp com os anexos apropriados.
- **Ações e atividade:** prévias da sessão atual e os últimos oitenta registros
  de auditoria (tipo, horário, estado e hash do destino; sem conteúdo de mensagens).

Envios, mudanças e execuções continuam exigindo **Aceitar / Recusar** na prévia.
A interface usa a mesma fila e o mesmo executor do `!ai`, com origens separadas
por navegador: uma aprovação da web não pode ser consumida por outro navegador
ou por um comando do WhatsApp. Cada token vence em cinco minutos e é consumido
antes da ação; falhas ou resultados incertos não geram repetição automática.

## Proteções

- Prova recente recebida do aparelho e revalidada pela ZAPO ao autorizar o login.
  Somente um comando explícito `!ai painel CÓDIGO` no chat consigo mesmo pode
  criar a autorização duradoura; uma autorização existente não pode criar outra.
  Em cada ferramenta/confirmação, a ZAPO verifica a autorização de trinta dias,
  sua expiração/revogação e a conta WhatsApp atual. Tokens inválidos não recaem
  sobre a prova curta. O painel não fabrica novas mensagens `fromMe`.
- Cookies HttpOnly/Secure/SameSite=Strict limitados a `/wpp/`; identificadores
  aleatórios de 256 bits, armazenados no servidor apenas pelo hash. O cookie
  temporário do desafio é substituído por uma nova sessão após a autorização.
- Sessões persistidas atomicamente em `.runtime/owner-panel/sessions.json`,
  diretório 700/arquivo 600: hash do cookie, origem, CSRF, validade, metadados da
  mensagem original (sem código/corpo/anexos) e credencial interna da boundary.
  Essa credencial fica apenas no servidor e nunca é enviada ao navegador/Fuel IX.
  A ZAPO conserva somente seu hash na tabela `kozz_owner_ai_web_grants`, junto à
  conta, ID da mensagem de origem e validade. Arquivos inválidos bloqueiam o acesso sem serem
  apagados ou substituídos automaticamente.
- Mutações exigem origem HTTPS exata e token CSRF da sessão. Não há API web
  pública de aprovação de códigos ou possibilidade de confirmar pelo modelo.
- Dados, nomes e textos são renderizados como texto, sem execução de HTML.
  CSP restringe scripts, estilos e conexões à própria origem e impede iframes.
- APIs usam `Cache-Control: no-store`; sem dados de sessão em localStorage,
  query strings, URLs ou logs. Pesquisas e históricos usam POST com JSON.
- Código do login não entra na conversa enviada ao Fuel IX. As conversas/dados
  consultados para responder seguem o processamento normal da IA existente.
- Criação de desafios limitada a oito por minuto e cem desafios simultâneos.
  A sessão aceita apenas uma operação de IA/ação por vez.
- Acesso negado não revela stack traces, QR, caminhos privados ou respostas
  brutas de provedores. Aprovações não equivalem a entrega/leitura no WhatsApp.

## Desenvolvimento e ativação

Fontes: `auth.ts`, `sessionStore.ts`, `server.ts`, `bridge.ts` e `public/`.
O build Babel existente copia HTML/CSS/JS para `dist/Services/OwnerPanel/public/`.
Não é necessário instalar dependências nem publicar em hospedagem externa.

Checks na aplicação:

```sh
npm run build
npx tsc --noEmit --pretty false
node test/owner-panel.test.cjs
node test/owner-panel-ui.test.cjs
node test/owner-ai.test.cjs
node test/owner-ai-handler.test.cjs
node test/fuelix-web-search.test.cjs
node test/autostatus.test.cjs
```

Os testes HTTP abrem uma porta efêmera no loopback e simulam WhatsApp/Fuel IX.
Os testes de interface usam JSDOM para navegação, formulários, prévias e escape
de texto; não substituem uma inspeção visual em navegador real. Um comando e
clique reais do proprietário são necessários para validar o fluxo no seu aparelho.

No API Gateway, compilar `npm run build`; as rotas personalizadas ficam no arquivo
local ignorado `src/Router/routes.ts`. Preservar as outras rotas e configurações.
Para mudanças só na aplicação, compilar/reiniciar `kozz-bot`. Reiniciar também
`api-gateway` apenas se suas rotas/código mudarem. Esta alteração de sessões
inclui a ZAPO: compilar o fonte canônico e reiniciar `kozz-zapo` e `machine-ai-zapo`,
pois compartilham o dist. Não resetar credenciais ou pareamento. Depois, verificar
processos online, `/wpp/`, assets e APIs sem sessão pelo gateway.

Ativação em 2026-10-26: builds da aplicação e do API Gateway, check TypeScript e
19 testes focados/regressões passaram. `kozz-bot` e `api-gateway` reiniciados e
confirmados online. Pelo gateway, `/wpp/`, CSS e JS retornaram 200/no-store;
`/wpp` redirecionou corretamente, a API protegida recusou ausência de sessão
(401) e origem hostil (403). O desafio sozinho não concedeu acesso e os cookies
vieram Secure/HttpOnly/SameSite=Strict no caminho correto. O comando `painel` e
os métodos de aprovação foram confirmados no gateway. A sessão Gramonta permaneceu
conectada/registrada sem QR; a porta 4890 foi confirmada apenas em 127.0.0.1.
A terminação TLS externa, a inspeção visual no navegador e o comando real do
proprietário no aparelho não foram simulados por esses testes.

Atualização de sessões em 2026-10-26: prazo absoluto de 30 dias, persistência
após reinícios e revogação individual/global ativados. Builds da aplicação/ZAPO,
check TypeScript e 60 testes passaram, incluindo avanço simulado além de quinze
minutos e até o vencimento em trinta dias, reabertura do armazenamento, restauração
do transporte, recusa por troca de conta e revogação persistente. `kozz-bot`,
`kozz-zapo` e `ai-test-zapo` reiniciados e confirmados online; Gramonta conectado,
registrado e sem QR. `/wpp/` e assets responderam 200; APIs recusaram ausência de
sessão (401) e origem hostil (403). Login real do proprietário não foi simulado;
o próximo login emitirá a autorização/cookie de trinta dias.
