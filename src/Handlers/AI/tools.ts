import { ResponseTool, ChatCompletionToolCall } from 'src/API/FuelIXApi';

export const talkTools: ResponseTool[] = [
	{
		type: 'function',
		function: {
			name: 'get_tia_message',
			description:
				'Busca uma mensagem estilo tia do zap, incluindo texto, titulo, fonte e imagem opcional. Use quando o usuario pedir mensagem de bom dia, boa tarde, boa noite, parabens, reflexao, motivacional ou algo parecido.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Consulta curta em portugues descrevendo o tipo de mensagem desejada, por exemplo: bom dia, feliz aniversario, mensagem motivacional.',
					},
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{ type: 'web_search' },
	{
		type: 'function',
		function: {
			name: 'get_chat_media',
			description:
				'Recupera e interpreta fotos, figurinhas, áudios ou vídeos de mensagens DESTE chat, quando o contexto textual não bastar. Use IDs do histórico/pedido; consulte get_chat_context antes se não souber quais mídias existem. Retorna imagens/quadros e transcrição como contexto multimodal, com autor e relações de resposta. Não aceita chatId, URL ou identidade. Vídeos/áudios são analisados por trechos de até 180s, até 8 quadros por vídeo; no máximo quatro mídias/trechos por pedido. Não invente conteúdo de arquivos indisponíveis.',
			parameters: {
				type: 'object',
				properties: {
					messageIds: {
						type: 'array',
						minItems: 1,
						maxItems: 2,
						items: { type: 'string' },
						description:
							'IDs exatos de uma ou duas mensagens com mídia apresentadas no contexto deste chat.',
					},
					startSeconds: {
						type: 'number',
						minimum: 0,
						maximum: 3600,
						description:
							'Opcional: início do trecho em segundos do arquivo original. Padrão 0.',
					},
					endSeconds: {
						type: 'number',
						minimum: 0,
						maximum: 3600,
						description:
							'Opcional: fim do trecho, no máximo 180s após o início. Padrão: até 180s ou fim do arquivo.',
					},
				},
				required: ['messageIds'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_chat_context',
			description:
				'Busca mensagens recentes APENAS do chat atual do WhatsApp. Antes de responder, use-a se o contexto disponível não bastar, a pergunta mencionar algo antigo ("antes", "ontem", "mais cedo") ou pedir resumo/análise da conversa. Não invente fatos ausentes do contexto. A ferramenta não aceita chatId: você só escolhe quantas mensagens recentes quer consultar.',
			parameters: {
				type: 'object',
				properties: {
					limit: {
						type: 'number',
						description:
							'Quantidade de mensagens recentes do chat atual a buscar. Escolha o menor limite suficiente: 20-50 para referência pontual, 50-100 para assunto em andamento, 100-200 para resumo/contexto amplo, e no máximo 300 para análise longa.',
					},
				},
				required: ['limit'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'generate_image',
			description:
				'Gera uma imagem ou edita imagens anexadas na mensagem atual ou nas mensagens citadas. Use quando o usuário pedir para criar, gerar, desenhar, ilustrar ou modificar uma imagem. As imagens disponíveis são enviadas automaticamente como referências para a edição.',
			parameters: {
				type: 'object',
				properties: {
					prompt: {
						type: 'string',
						description:
							'Instrução detalhada de criação ou edição. Para edição, descreva a mudança desejada e o que deve ser preservado nas imagens de referência.',
					},
				},
				required: ['prompt'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'generate_speech',
			description:
				'Gera um áudio narrado a partir de texto. Use quando o usuário pedir áudio, voz, narrar, falar em voz alta, mandar em áudio, transformar texto em áudio, ou responder com uma mensagem falada.',
			parameters: {
				type: 'object',
				properties: {
					input: {
						type: 'string',
						description:
							'Texto exato que deve ser falado no áudio. Escreva uma versão limpa e natural, sem markdown bruto, mantendo a intenção do usuário.',
					},
					voice: {
						type: 'string',
						enum: [
							'alloy',
							'ash',
							'ballad',
							'coral',
							'echo',
							'fable',
							'nova',
							'onyx',
							'sage',
							'shimmer',
							'verse',
							'marin',
							'cedar',
						],
						description:
							'Voz usada na narração. Use alloy por padrão quando o usuário não escolher uma voz.',
					},
				},
				required: ['input'],
				additionalProperties: false,
			},
		},
	},
];

export const extractToolArgs = (
	toolCall: ChatCompletionToolCall
): Record<string, unknown> | undefined => {
	try {
		return JSON.parse(toolCall.function.arguments);
	} catch {
		return undefined;
	}
};

export const findToolCall = (
	toolCalls: ChatCompletionToolCall[] | undefined,
	name: string
): ChatCompletionToolCall | undefined =>
	toolCalls?.find(({ function: f }) => f.name === name);
