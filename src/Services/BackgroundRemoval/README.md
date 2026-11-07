# Figurinhas com remoção de fundo em CPU

Use `!s --sem-fundo` (ou o atalho `!s --sf`) na legenda ou respondendo a uma foto estática.
Também: `!ai faz uma figurinha dessa foto sem o fundo`. O módulo `s` publica
contrato e boolean `sem-fundo` no catálogo da IA. `chat_execute_command` usa
module=`s`, method=`default`, immediateArg vazio, namedArgs=`{"sem-fundo":true}`.
A mídia vem do pedido/citação; não é uma URL ou caminho fornecido pelo modelo.
O destino permanece no chat de origem e as permissões/middlewares são os mesmos.

`!s` normal continua aceitando GIFs/vídeos e criando figurinhas de textos.
A opção de remoção aceita imagens estáticas JPG/PNG/WebP/AVIF/HEIF/TIFF até
8 MB e 16 megapixels. GIFs, vídeos, SVGs e imagens animadas são recusados.
Cache/histórico só é consultado para a foto do pedido e no próprio chat.
Mídia indisponível exige reenvio; não gera uma imagem substituta.

## Instalação

- Dependência: `onnxruntime-node` 1.31.1, CPU. `.npmrc` define
  `onnxruntime-node-install=skip`, evitando os downloads extras de CUDA.
  Em outros instaladores, usar `ONNXRUNTIME_NODE_INSTALL=skip`.
- Após instalar dependências e executar `npm run build`, rodar
  `npm run setup:background`. Baixa o modelo u2netp oficial de 4.574.861 bytes,
  verifica SHA-256 fixado e grava atomicamente em
  `.runtime/background-removal/models/u2netp.onnx`. Pesos não são versionados.
- O processamento não baixa modelos nem envia imagens a uma API externa.
  Se faltar o modelo ou o checksum estiver errado, a operação falha.
- Fontes: [pesos/distribuição rembg](https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py),
  [modelo U²-Net](https://github.com/xuebinqin/U-2-Net) e
  [runtime ONNX Node](https://github.com/microsoft/onnxruntime/tree/main/js/node).

## Operação e limites

Um processo filho Node reutiliza a sessão ONNX, com um thread de inferência e
Sharp com concorrência 1/cache desligado. A fila admite no máximo quatro pedidos,
um por remetente. Cada foto tem até 30 segundos de processamento; downloads têm
15 segundos/8 MB e consultas de mídia até 10 segundos por recurso. O subprocesso
é encerrado em timeout/falha; os pedidos restantes continuam, sem repetir o que
falhou. Após dez minutos sem pedidos ele é encerrado para liberar memória.
Só inicia no primeiro uso; não exige processo PM2 adicional.

Normalização RGB por máximo da imagem, mean/std ImageNet e tensor NCHW 320×320,
conforme a sessão u2netp do rembg. A máscara usa a primeira saída e é normalizada,
redimensionada com interpolação e multiplicada pelo alfa original. A orientação
EXIF é aplicada, a proporção é preservada e a imagem resultante tem até 512 px
no maior lado. PNG RGBA segue para a conversão WebP transparente existente na
ZAPO. Não usa preenchimento generativo nem alpha matting pesado.

Arenas de memória CPU e padrões de alocação do ONNX foram desligados para reduzir
o pico de RAM. Em quatro execuções de uma foto pública do rembg (animal-1.jpg),
no servidor de 2 vCPUs EPYC: primeira foto 2,949 s; seguintes 0,826/0,870/0,631 s.
Pico máximo observado 416 MiB; RSS após a quarta foto 318 MiB no subprocesso.
São medições dessa foto nesse momento, sem incluir baixar/enviar no WhatsApp.
Imagens maiores e carga simultânea dos outros serviços podem elevar tempo/RAM.

## Validação

Build/Babel e `tsc --noEmit --pretty false` na aplicação. Testes:
`node --test --test-isolation=none test/background-removal.test.cjs
test/sticker-background.test.cjs test/chat-commands.test.cjs test/mute.test.cjs`.
Os testes de inferência real exigem o modelo instalado. Cobrem alfa/transparência
até o WebP 512×512, flag no parser real, execução local pela IA sem privilégio,
cache na origem, validações, fila, timeout, crash, saída por inatividade e
regressão do `!s` normal. Fotos/agenda de usuários e envios reais não são usados.
Após alterar fontes, compilar e reiniciar somente `kozz-bot`; a ZAPO não mudou.

Ativação em 2026-10-30: build e TypeScript aprovados; 38 testes focados passaram,
incluindo transporte simulado, inferência real e WebP com alfa. O teste com
o mesmo worker reutilizado por pedidos de dois grupos também passou: cada
figurinha manteve o chat correto. Reiniciado somente `kozz-bot`, confirmado
online após o intervalo. Gateway confirmou o módulo `s`, schema atualizado e
ajuda com `!s --sem-fundo`; WhatsApp `connected=true`, `registered=true`,
`hasQr=false`. Não foi enviada figurinha real pelo WhatsApp durante os testes;
a visualização no aparelho ainda depende do uso normal do comando.

A instalação npm encontrou metadados incompletos de dependências opcionais no
lockfile antigo (`Invalid Version`). Foram removidas apenas as entradas
opcionais sem versão e o npm regenerou o lock, incluindo os metadados atuais
das dependências locais. Os links para module-maker/types canônicos permanecem.
Mute passou a obter o tipo do socket por module-maker, removendo a dependência
de um `socket.io-client` extraneous que o npm podou; os 14 testes de mute passaram.
