# Bola 8 mágica

`!8ball Vou ter sorte hoje?` sorteia uma das 20 respostas em português:
10 positivas, 5 incertas e 5 negativas. É uma brincadeira, sem previsão real.
Não exige ponto de interrogação. Sem pergunta ou com `!8ball help`, mostra ajuda.
O recurso `help` também aparece no menu geral.

Disponível em grupos e no privado, respeitando os middlewares de banimentos,
comandos de grupo e mute. A inicialização comum registra o módulo na IA;
o contrato publica a sintaxe e valida perguntas vazias. `!ai` pode executar
`8ball.default`, com a pergunta em `immediateArg`, somente no chat de origem.
Sem persistência, consultas externas ou novos serviços.

Validação local: build, TypeScript, Prettier e
`node --test test/eightball.test.cjs test/chat-commands.test.cjs`.
O teste executa o handler com transporte simulado, incluindo ajuda, pergunta,
execução pela IA e bloqueio de destino forjado. Entrega no WhatsApp exige
verificação no aparelho. Ativação: reiniciar somente `kozz-bot` após o build.
