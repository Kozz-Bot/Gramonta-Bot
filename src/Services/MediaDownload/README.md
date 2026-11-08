# Downloads unificados

`!video LINK` envia vídeo; `!audio LINK` envia áudio em OGG/Opus como voz.
Ambos aceitam o texto completo de compartilhamento e links em mensagens citadas.
Sem argumento, recuperam a citação somente no chat/boundary de origem.
Um argumento explícito tem prioridade e nunca usa outra URL da citação se for
inválido. Maiúsculas, IDs e assinaturas vêm do texto original do comando.

Texto sem link busca o primeiro resultado no YouTube: `!audio Beethoven Moonlight
Sonata`. Ajuda: `!video help` e `!audio help`; também disponíveis no `!help` e no
catálogo da IA. A IA executa os handlers reais somente no chat de origem,
com os middlewares e a identidade de quem pediu; recebe resultado estruturado
`submitted` após emissão da mídia, ou falha real. Isso não confirma entrega.

`!tw`, `!ig`, `!fb`, `!tt`, `!yt video` e `!yt song` continuam funcionando durante
a transição. Respondem que serão removidos e orientam a usar `!video`/`!audio`.
Não há data de remoção definida. Os atalhos de redes sociais preservam a
validação da plataforma correspondente, mas executam o mesmo downloader.

## Provedores

1. YouTube (incluindo links curtos e resultados de busca): exclusivamente a API
   HTTPS remota já configurada em `YOUTUBE_API_*`. Cookies permanecem no servidor
   remoto. Falha da API não dispara yt-dlp nem Cobalt locais. O retorno de mídia
   fica em memória, sem arquivos compartilhados entre pedidos. Respostas por
   caminho de arquivo remoto não são aceitas pelos comandos unificados.
2. Outros sites: yt-dlp oficial em `~/.local/bin/yt-dlp`, configurável por
   `YT_DLP_PATH`, sem cookies, configuração do usuário ou plugins. O proprietário
   autorizou uso direto em 2026-11-08: Yoinks 0.3.1 é uma interface interativa
   sobre yt-dlp e não oferece o modo automático necessário ao bot.
3. Se a primeira tentativa ou a inspeção da mídia falhar, tenta Cobalt uma vez.
   API própria por `COBALT_API_URL` (padrão `http://127.0.0.1:9011/`);
   `COBALT_API_KEY` é opcional para uma instância autenticada. Não usa API
   pública de terceiros. Respostas `redirect`, `tunnel` e primeiro vídeo de
   `picker` são suportadas; `local-processing` é desativado no pedido.

Cobalt roda no PM2 como `cobalt-api`, grupo `kozz-shared`, em
`Projects/cobalt/api`, configurado em `Projects/ecosystem.config.cjs`. API e
túnel interno vinculados a loopback; YouTube desativado. Operação em
`Projects/cobalt/SERVER.md`. Não exige alterar autenticação do WhatsApp.

## Limites e transporte

Dois pedidos simultâneos, um por pessoa/boundary, compartilhados por comandos
novos e antigos. Conteúdo público, até 600 segundos. Origem limitada a 32 MiB;
saída de vídeo até 32 MiB e de áudio até 16 MiB. yt-dlp tem 120 segundos por
tentativa, Cobalt 30 segundos para extração e 120 para mídia; inspeção 15 segundos
e conversão local 120 segundos. Tempos não representam prazo total único.

O yt-dlp seleciona arquivo direto HTTPS, preferindo MP4/H.264 e 720p para vídeo;
áudio seleciona faixa direta ou extrai do vídeo. Não faz merge de faixas nem
download HLS pelo yt-dlp. Portanto um site suportado pelo yt-dlp pode não ter
formato compatível com estes limites; Cobalt pode atendê-lo na segunda tentativa.
Playlists não são percorridas; seleciona o primeiro item disponível.

URLs de entrada usam HTTPS em hosts públicos, sem credenciais ou portas extras.
Resolução de redirects e mídia verifica DNS a cada conexão e fixa somente
endereços IPv4 públicos. O tráfego inteiro do subprocesso yt-dlp passa por um
proxy temporário em loopback que aplica a mesma restrição às URLs secundárias,
bloqueando também extração local de YouTube. Apenas o túnel da instância Cobalt
configurada pode acessar seu endereço local. O proxy fecha sockets em `finally`.

FFprobe/FFmpeg leem somente arquivos locais, com whitelist `file,pipe`.
Vídeo H.264 em MP4 é preservado; outros formatos são convertidos para MP4/H.264.
Áudio é convertido para OGG/Opus. Temporários são exclusivos por pedido e
removidos em `finally`. Erros ao usuário não incluem resposta bruta, URLs
assinadas ou logs dos provedores.

## Validação em 2026-11-08

Downloads reais, sem emissão no WhatsApp:

- Link genérico MDN `flower.mp4`: vídeo MP4 de 1.128.375 bytes e 5,055 s;
  extração de áudio OGG/Opus aprovada.
- YouTube `jNQXAC9IVRw`: API HTTPS remota retornou vídeo de 629.172 bytes,
  aproximadamente 18,95 s, e áudio OGG/Opus de 155.723 bytes.
- Cobalt: Reel Facebook `2495759980907609`, vídeo de 658.906 bytes e
  áudio OGG/Opus de 50.890 bytes. Ambos aprovados na inspeção local.
- O link `/share/v/1CF64Dn7B3/` resolve para Reel `1465657375626763`, mas
  continua falhando: yt-dlp `Cannot parse data` e Cobalt `error.api.fetch.empty`.
  A segunda tentativa não garante disponibilidade de cada publicação.

Checks: build, TypeScript, Prettier e testes dos downloads, links, compatibilidade
e IA. Transporte WhatsApp simulado nos testes de handlers e isolamento; nenhuma
mensagem de teste foi enviada a contatos/grupos reais.

```sh
npm run build
./node_modules/.bin/tsc --noEmit --pretty false
npm run format:check
node --test test/media-download.test.cjs test/twitter.test.cjs test/social-video.test.cjs test/command-links.test.cjs test/chat-commands.test.cjs
pm2 restart kozz-bot
```

Aguarde o registro escalonado dos handlers e confira `video`, `audio`, `yt`,
`tw`, `ig`, `fb`, `tt` no gateway. Confirme PM2 online e WhatsApp com
`connected=true`, `registered=true`, `hasQr=false`.

Ativação confirmada em 2026-11-08: `kozz-bot` reiniciado, `cobalt-api` online,
sete handlers de download registrados no gateway e WhatsApp pronto
(`connected=true`, `registered=true`, `hasQr=false`, `ready=true`). Estado do
PM2 salvo; `pm2-github-runner.service` confirmado ativo e habilitado no boot.
39 testes de regressão passaram, além de build, TypeScript e Prettier.
