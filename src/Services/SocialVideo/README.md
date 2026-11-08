# Downloads de vídeos públicos

Desde 2026-11-08, prefira `!video LINK` e `!audio LINK`. Os atalhos abaixo
continuam funcionando com aviso de remoção, usando o mesmo fluxo unificado:
yt-dlp direto → Cobalt; YouTube somente na API HTTPS remota.
[Operação atual, limites e testes](../MediaDownload/README.md).
As seções técnicas abaixo documentam a implementação anterior e as correções
de links que os atalhos preservam.

| Comando    | Plataforma | Links aceitos                                                                                                                      |
| ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/tw link` | Twitter/X  | Posts `/usuario/status/id`, `/i/status/id`, `/i/web/status/id`                                                                     |
| `/ig link` | Instagram  | Posts `/p/codigo`, reels `/reel/codigo`, `/reels/codigo` e vídeos `/tv/codigo`                                                     |
| `/fb link` | Facebook   | Reels, `/usuario/videos/id`, `/usuario/posts/id`, `/watch/?v=id`, `/video.php?v=id`, links `fb.watch` e `/share/v/` ou `/share/r/` |
| `/tt link` | TikTok     | `/@usuario/video/id`, links curtos `vm.tiktok.com`, `vt.tiktok.com` e `/t/codigo`                                                  |

Também aceita prefixo `!`. Cada comando registra ajuda em `help`, acessível pelo menu geral e por `/ig help`, por exemplo. O resultado é um vídeo MP4 em resposta ao comando original. Em posts com vários vídeos, seleciona o primeiro; não percorre perfis, stories, álbuns de fotos ou transmissões ao vivo.

Também é possível responder à mensagem que contém o link usando apenas `!tt`, `!tw`, `!ig` ou `!fb`. O comando extrai o primeiro link de vídeo válido da sua plataforma do texto ou legenda citada, ignorando links de outros sites. Se o texto citado não veio no evento, consulta `message_by_id` na boundary de origem usando o ID citado e o chat atual. Mensagens sem link válido recebem orientação para citar a mensagem correta ou colar o link.

Um link ou texto compartilhado escrito depois do comando tem prioridade sobre a mensagem citada. Aceita títulos, quebras de linha e pontuação junto do link, preservando letras maiúsculas nos códigos. Por exemplo: `!tt Olha esse vídeo https://vt.tiktok.com/ZSgHweQy2/ Compartilhado via TikTok`. Também aceita formatos móveis `/v/id.html` e de embed do TikTok, normalizados para o extractor oficial.

Correção de 2026-11-07: argumentos recebidos pelo gateway podem estar em
minúsculas. Os comandos de vídeo agora recuperam o argumento da mensagem original
quando ela corresponde ao comando, preservando códigos sensíveis a maiúsculas
do Facebook, Instagram e TikTok. Pedidos sintéticos sem esse texto continuam
usando `rawCommand.query`. Link explícito inválido não usa a citação como fallback.
O exemplo `https://www.facebook.com/share/v/19tFAqdJz8/` resolveu para o Reel
`2495759980907609` e foi baixado/inspecionado no servidor sem cookies ou login:
658.906 bytes, aproximadamente 6,63 segundos. Não representa envio no WhatsApp.
Validação: build, TypeScript, formatação e 18 testes de downloads/handlers
aprovados. A reprodução real passou pelo parser do gateway (argumento convertido
em minúsculas) e pelo handler corrigido com download verdadeiro; somente a
resposta ao WhatsApp foi simulada. Ativação exige apenas reiniciar `kozz-bot`.

A leitura original foi centralizada em `Utils/commandText.ts` e aplicada também
a `!yt video`, `!yt song` e `!s from-link`. Ela preserva o caminho, IDs e
parâmetros assinados, incluindo trechos `--` dentro da URL. `!role` também lê
o texto original, como seus aliases `!evento`/`!rolê`, para preservar links de
localização. A IA já recebe o texto original no contexto; `!lembrete` já o
recupera. Links de mídias/citações e respostas de APIs não usam argumentos
normalizados. Buscas por texto e argumentos ausentes continuam suportados.

## Dependências e operação

O downloader compartilhado usa o yt-dlp oficial em `~/.local/bin/yt-dlp` (2026.10.21), Python 3 e ffprobe. `YT_DLP_PATH` permite configurar outro executável. As quatro plataformas usam a mesma implementação e o mesmo controle de concorrência.

Não usa cookies, credenciais de contas nem configurações locais do yt-dlp. Conteúdo que exige login, é privado ou restrito não é atendido. Conteúdo público pode ficar indisponível por bloqueios da plataforma ou mudanças que exijam atualizar o yt-dlp.

Aceita apenas HTTPS nos domínios explícitos de cada plataforma. Remove parâmetros de rastreamento, preservando o identificador `v` do Facebook. Links curtos têm até cinco saltos e cinco segundos por salto; cada destino é validado antes do acesso e as respostas são fechadas sem carregar o corpo completo.

Limites compartilhados: dois downloads simultâneos e um por usuário, 32 MiB, 10 minutos, 120 segundos de download e 15 segundos de inspeção. A resolução de links curtos ocorre antes do download. Seleciona MP4 direto por HTTPS, com preferência por H.264 e 720p; não faz merge de faixas ou downloads HLS externos. O buffer do subprocesso impõe o limite mesmo sem tamanho declarado pelo provedor. O ffprobe confirma H.264 e duração usando somente protocolo local, e os temporários são removidos em `finally`. Formatos sem MP4 direto compatível são recusados.

Não registre saída bruta do provedor nem URLs assinadas. `reply.withMedia` indica emissão ao socket, sem confirmação de entrega pelo WhatsApp.

## Validação e ativação

```sh
npm run build
npx tsc --noEmit --pretty false
node --test test/twitter.test.cjs test/social-video.test.cjs
pm2 restart kozz-bot
```

Os testes locais verificam normalização, validações, redirecionamentos, limites compartilhados, envio pelo handler, inspeção de MP4 real, arquivos corrompidos/vazios/grandes e limpeza. Os testes de mídia exigem subprocessos Node/FFmpeg/ffprobe.

Em 2026-10-24, foram baixados e inspecionados exemplos públicos reais das quatro plataformas: Instagram (4,97 s), Facebook (9,57 s), TikTok (27,47 s) e Twitter (15,56 s). Isso não representa teste de entrega pelo WhatsApp. Depois do restart, aguarde o início escalonado dos handlers e confirme `tw`, `ig`, `fb`, `tt` no snapshot do gateway, além do processo online no PM2.

Na validação da leitura de mensagens citadas, os 16 testes locais passaram e o link curto TikTok `https://vt.tiktok.com/ZSgHweQy2/` foi resolvido e baixado com sucesso (16,02 s), sem envio pelo WhatsApp.
