# Figurinhas

`!s` na legenda de um vídeo ou em resposta a ele cria uma figurinha animada
com o áudio original. `!s --sem-som` cria a figurinha WebP animada silenciosa.
O corte começa no início do vídeo e conserva até dez segundos. Se a origem não
tiver faixa de áudio, a figurinha permanece silenciosa. GIFs/fotos não ganham som.
WhatsApp precisa ter suporte a figurinhas com áudio para reproduzir o anexo.

Responder a uma figurinha com `!s` preserva seu áudio quando disponível;
`!s --sem-som` o remove. `!s toimg` continua convertendo em imagem/vídeo comum
sem áudio. `!s --sem-fundo` e `!s --sf` recortam apenas fotos estáticas.
Ajuda: `!s help` e `!help`.

Na IA local, peça uma figurinha do vídeo com ou sem som. O método `s.default`
publica `sem-som: boolean?`; a ferramenta passa `namedArgs={"sem-som":true}`
para retirar o som. Anexo, autor, permissões e chat original são preservados.

O handler envia `media.stickerSound` à boundary, que converte e sobe WebP e
OGG/Opus como arquivos criptografados independentes. A ZAPO inclui o descritor
de áudio no campo 26 de `StickerMessage`, produzindo uma única mensagem.
Recebimento/cache usam `media.stickerAudio`, sem alterar a classificação STICKER.
Limites e protocolo: [kozz-zapo](../../../../../framework/kozz-zapo/README.md).

Regressão: `npm run build` e
`node --test --test-isolation=none test/sticker-background.test.cjs test/chat-commands.test.cjs test/command-links.test.cjs`.
Inclui parser e execução real do handler pela IA com transporte simulado.
Conversão, protobuf e cache persistente são testados na suíte da ZAPO.
O proprietário confirmou o funcionamento no WhatsApp em 2026-11-26.
Os testes locais usam transporte simulado; a reprodução requer WhatsApp compatível.
