import {
	AiToolInputError,
	registerAiContract,
} from '../../Services/OwnerAI/contracts';

export const registerStickerContract = () =>
	registerAiContract('s', {
		description:
			'Cria figurinhas com a imagem/vídeo anexado ou citado. Para foto com fundo transparente use default com namedArgs={"sem-fundo":true}. Não usa IA generativa nem redesenha a foto. Resultado sempre no chat do pedido.',
		methods: {
			default: {
				syntax: '!s [--sem-fundo | --sf] [--tags TEXTO]',
				examples: ['!s', '!s --sem-fundo', '!s --sf'],
				description:
					'Imagem anexada ou citada. sem-fundo (alias sf) é boolean opcional, apenas fotos estáticas até 8 MB/16 MP. Na ferramenta, passe namedArgs como JSON: {"sem-fundo":true}, immediateArg vazio. Não escreva a flag em immediateArg.',
			},
			help: { syntax: '!s help', examples: ['!s help'] },
			full: { syntax: '!s full (respondendo a texto)', examples: ['!s full'] },
			toimg: {
				syntax: '!s toimg (respondendo a figurinha)',
				examples: ['!s toimg'],
			},
		},
		validate: (method, input) => {
			if (method === 'default' && /--(?:sem-fundo|sf)\b/i.test(input))
				throw new AiToolInputError(
					'Passe a opção no JSON namedArgs: {"sem-fundo":true}, com immediateArg vazio.'
				);
		},
	});
