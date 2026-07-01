import { ChatCompletionTool, ChatCompletionToolCall } from 'src/API/MistralApi';

export const talkTools: ChatCompletionTool[] = [
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
	{
		type: 'function',
		function: {
			name: 'search_web',
			description:
				'Pesquisa informações atualizadas na internet. Use SEMPRE que a pergunta envolver: notícias, eventos recentes, preços, clima, resultados esportivos, lançamentos, dados que mudam com o tempo, ou qualquer coisa que você não tem certeza se seu conhecimento está atualizado. Na dúvida, pesquise — é melhor pesquisar desnecessariamente do que dar uma resposta desatualizada ou inventada. Use mode="full" quando precisar de detalhes aprofundados ou quando o resultado resumido não for suficiente.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Consulta de busca em português ou inglês, otimizada para mecanismo de busca. Seja específico e inclua palavras-chave relevantes.',
					},
					mode: {
						type: 'string',
						enum: ['summary', 'full'],
						description:
							'Use "summary" (padrão) para respostas rápidas com snippets. Use "full" quando precisar de conteúdo completo das páginas para responder com precisão.',
					},
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_chat_context',
			description:
				'Busca mensagens recentes APENAS do chat atual do WhatsApp. Use quando a pergunta depender do histórico da conversa, por exemplo "quem falou isso?", "qual festa o Pedro foi?", "o que combinaram?", "resume a conversa", ou quando precisar lembrar algo dito antes. A ferramenta não aceita chatId: você só escolhe quantas mensagens recentes quer consultar.',
			parameters: {
				type: 'object',
				properties: {
					limit: {
						type: 'number',
						description:
							'Quantidade de mensagens recentes do chat atual a buscar. Use 50-100 para perguntas simples, 200-500 para contexto amplo, e até 1000 para resumos longos.',
					},
				},
				required: ['limit'],
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
