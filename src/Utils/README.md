# Texto original de comandos

`commandText.ts` recupera argumentos sem alterar maiúsculas, acentos, caminhos
ou parâmetros de URL. A rota do gateway pode usar `santizedBody`, que converte
o comando inteiro para minúsculas; por isso `rawCommand.query` e `immediateArg`
não são fontes confiáveis de IDs sensíveis a caixa.

Use `originalCommandQuery(requester, 'fb')` para a consulta completa ou
`originalCommandQuery(requester, 'yt', 'video')` para o argumento após o
subcomando. Só usa `message.body` quando o nome do comando e o subcomando
correspondem. Sem esse texto, mantém o campo estruturado adequado, importante
para IA/painel/MCP e testes. Um comando original sem argumento continua vazio;
o helper não busca uma URL em outra mensagem nem inventa um destino.

Consumidores: downloads de redes sociais, YouTube (vídeo/voz) e figurinha por
URL. Eventos e lembretes também preservam seus textos originais, com seus
parsers de aliases e flags. O parser geral, as permissões e os transportes
de mídia não foram alterados.

Regressões em `test/command-links.test.cjs`, `test/twitter.test.cjs` e
`test/role.test.cjs` exercitam os handlers com argumentos normalizados pelo
parser real. APIs externas são simuladas, sem baixar mídia ou publicar eventos
reais. Também cobrem parâmetros assinados, consultas textuais, vazios e
fallback para chamadas sintéticas.

Validação de 2026-11-07: build, TypeScript, formatação e 35 testes focados
aprovados, cobrindo comandos de links, downloads sociais, eventos, figurinhas e
confinamento da IA. Ativação somente em `kozz-bot`, com sessões preservadas.
