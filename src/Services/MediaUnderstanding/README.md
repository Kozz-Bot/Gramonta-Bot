# Interpretação de mídias no !ai

Implementado em 2026-10-31. Vídeos são convertidos em até oito quadros JPEG
com horários e áudio MP3 mono para a transcrição existente do FuelIX. O modelo
recebe imagens reais e texto transcrito; não recebe vídeo contínuo. Cenas rápidas,
música e sinais sonoros podem não ser representados. Sem novo modelo local/GPU.

O anexo do pedido e a citação direta são preparados automaticamente. O histórico
continua textual, com ID, tipo, presença de mídia, autor e relação de resposta.
Quando esses dados não bastam, `get_chat_media` aceita um ou dois `messageIds`
descobertos no histórico/pedido e horários opcionais `startSeconds/endSeconds`.
Os resultados entram como contexto multimodal após o resultado da ferramenta,
com o mesmo contexto preservado quando o provedor não retorna response ID.

Exemplos: envie/cite um vídeo com `!ai resume esse vídeo`; ou peça
`!ai explica a discussão e veja as mídias se precisar`. Fotos, figurinhas
estáticas e áudios também podem ser consultados. Mídia expirada exige reenvio.

## Escopo e limites

- Somente o chat original, boundary Gramonta/default; nenhuma URL, destino ou
  identidade é aceita como argumento da ferramenta. Painel privado/MCP não
  recebem esta ferramenta nem ganham permissões adicionais.
- IDs precisam estar no pedido, citações ou histórico consultado. O novo recurso
  ZAPO `chat_media_message` valida a associação ao chat antes de buscar cache
  ou baixar; a aplicação confere novamente chat e ID na resposta.
- Até 32 MiB por arquivo, 16 MP por imagem/quadro e uma hora por arquivo de
  áudio/vídeo. Cada trecho tem no máximo 180 segundos; padrão primeiros 180s.
- Até quatro combinações mídia/trecho por pedido, incluindo anexos/citação
  inicial; uma ou duas por chamada. Resultados/falhas repetidos são reutilizados.
- Uma interpretação ativa no processo e até três aguardando. Preparação com
  orçamento de 60s; subprocessos de 10–30s, áudio transcrito com timeout de 60s.
  Upload de quadro com timeout de 30s; falha encerra os uploads restantes.
- Imagem estática até 1024px por lado; quadros de vídeo até 768px. FFmpeg usa
  um thread e só arquivos locais, com lista restrita de demuxers/protocolos.
  Diretórios exclusivos são removidos em finally, inclusive após falhas.
- Quadros normalizados usam CDN temporário já existente, com exclusão agendada
  após dez minutos. Transcrições têm no máximo 12 mil caracteres. Não há novo
  arquivo persistente local ou coleta passiva de mídias antigas.

Áudio ausente, falha de transcrição/upload, amostragem e cortes são explícitos.
Falha visual preserva transcrição disponível; falha de áudio preserva quadros.
A autoria do envio não identifica necessariamente quem fala/aparece na mídia.
Textos e falas da mídia são dados não confiáveis, sem autorizar novas ações.

## Validação e operação

`npm run build` e `./node_modules/.bin/tsc --noEmit --pretty false` na aplicação;
`npm run build` na boundary. Testes: `ai-video`, `ai-media-context`, `ai-workflow`,
`fuelix-web-search`, regressões de contexto/memória/comandos e `chat-media` na
boundary. Vídeos sintéticos locais, transportes/provedor/CDN simulados, sem
conversas reais enviadas ao modelo nem mensagens de teste enviadas a grupos.

Após build da aplicação e boundary compartilhada, reiniciar `kozz-bot`,
`kozz-zapo` e `machine-ai-zapo`. Preservar bancos/credenciais e verificar PM2,
registro do handler e WhatsApp conectado, registrado e sem QR pendente.

Ativação verificada em 2026-10-31: build/TypeScript da aplicação e build da
boundary aprovados; 83 testes passaram (14 de mídias/fluxo, 20 regressões de
contexto/memória/comandos/API, um do painel e 48 da boundary). Reiniciados
`kozz-bot`, `kozz-zapo` e `machine-ai-zapo`, confirmados online após o intervalo.
Gateway confirmou handler, ajuda e ferramenta; consulta do novo recurso com ID
inexistente funcionou sem baixar arquivos. Gramonta conectado, registrado e sem
QR pendente. Nenhuma conversa real enviada ao modelo ou mensagem de teste enviada
a grupos. A interpretação pelo provedor real ainda depende do próximo uso.

Correção de transporte (2026-10-31): após transcrição com timeout explícito,
Axios/follow-redirects reaproveitava o socket com listener de destruição por
inatividade. `/responses` sem timeout explícito herdava o prazo de 5s do agente
HTTP do Node, causando `ECONNRESET: socket hang up`. Reproduzido inteiramente em
servidor local: transcrição rápida, mesma conexão, resposta após 5,5s. Responses
agora define 120s por padrão e preserva prazos explícitos de cada chamador.
`fuelix-timeout.test.cjs` testa reutilização real de socket, resposta acima de
5s e prazo explícito curto. Sem chamada ao FuelIX real nem conversa real.
