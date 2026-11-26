import {
	AiToolInputError,
	registerAiContract,
} from '../../Services/OwnerAI/contracts';

export const registerStickerContract = () =>
	registerAiContract('s', {
		description:
			'Cria figurinhas com a imagem/vídeo anexado ou citado. Vídeos incluem o som original por padrão; para figurinha silenciosa use namedArgs={"sem-som":true}. Para foto com fundo transparente use default com namedArgs={"sem-fundo":true}. Não usa IA generativa nem redesenha a foto. Resultado sempre no chat do pedido.',
		methods: {
			default: {
				syntax: '!s [--sem-som] [--sem-fundo | --sf] [--tags TEXTO]',
				examples: ['!s', '!s --sem-som', '!s --sem-fundo', '!s --sf'],
				description:
					'Imagem ou vídeo anexado ou citado. Vídeo vira figurinha com áudio original até 10 segundos; vídeo sem áudio permanece silencioso. sem-som é boolean opcional para retirar o áudio. sem-fundo (alias sf) é boolean opcional, apenas fotos estáticas até 8 MB/16 MP. Na ferramenta, passe namedArgs como JSON: {"sem-som":true} ou {"sem-fundo":true}, immediateArg vazio. Não escreva a flag em immediateArg.',
			},
			help: { syntax: '!s help', examples: ['!s help'] },
			full: { syntax: '!s full (respondendo a texto)', examples: ['!s full'] },
			toimg: {
				syntax: '!s toimg (respondendo a figurinha)',
				examples: ['!s toimg'],
			},
		},
		validate: (method, input) => {
			if (method === 'default' && /--(?:sem-som|sem-fundo|sf)\b/i.test(input))
				throw new AiToolInputError(
					'Passe a opção no JSON namedArgs: {"sem-fundo":true} ou {"sem-som":true}, com immediateArg vazio.'
				);
		},
	});
