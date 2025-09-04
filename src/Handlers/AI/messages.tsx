import {
	Bold,
	ForEach,
	Italic,
	Line,
	List,
	Code,
	Stroke,
	Monospace,
} from 'kozz-module-maker';

export const EmptyPrompt = () => {
	return (
		<>
			<Line>
				<Bold>Erro!</Bold>
			</Line>
			<Line>Me diga o quue devo criar.</Line>
		</>
	);
};

export const TranscribeNeedsQuote = () => {
	return (
		<>
			<Line>
				<Bold>
					<Italic>Instruções:</Italic>
				</Bold>
			</Line>
			<Line>
				Responda um video ou audio com esse comando para que eu possa transcrevê-lo.
			</Line>
		</>
	);
};

export const EmojifyNeedsQute = () => {
	return (
		<>
			<Line>
				<Bold>
					<Italic>Instruções:</Italic>
				</Bold>
			</Line>
			<Line>
				Responda uma mensagem de texto com esse comando para que eu insira vários
				emojis no texto escolhido.
			</Line>
		</>
	);
};

const aiCommands = [
	{
		name: 'image',
		coins: 5,
		description: 'Gera imagens com IA',
		example: ['!ai image gato jogando basquete --style anime'],
	},
	{
		name: 'image-styles',
		coins: 0,
		description: 'Devolve a lista de estilos de imagem que a IA pode gerar',
		example: ['!ai image-styles'],
	},
	{
		name: 'transcribe',
		coins: 0,
		description: 'Transcreve áudios e vídeos das mensagens',
		example: ['!ai transcribe'],
	},
	{
		name: 'talk',
		coins: 0,
		description:
			'Chatbot do calvoGPT. Responda as mensagens para continuar a conversa',
		example: ['!ai talk olá chat, como está?'],
	},
	{
		name: 'emojify',
		coins: 0,
		description: 'Enche a mensagem quotada de emojis',
		example: ['!ai emojify'],
	},
	{
		name: 'read-image',
		coins: 0,
		description: 'A IA vai gerar uma descrição em texto do que ela vê na imagem',
		example: ['!ai read-image'],
	},
	{
		name: 'summary',
		coins: 0,
		description:
			'Solicita um resumo da conversa do grupo à IA, ou você pode perguntar coisas também. Por padrão, as últimas 200 mensagens são enviadas à IA para fornecer contexto. Você pode enviar até 1000 mensagens utilizando o atributo --context',
		example: [
			'!ai summary',
			'!ai summary --context 300',
			'!ai summary Qual é o motivo da briga? --context 100',
		],
	},
];

export const Help = () => {
	return (
		<>
			<Line>
				<Bold>Inteligência artificial</Bold>
			</Line>
			<Line>
				Alguns desses comandos são PAGOS. Cada comando usa uma quantidade de
				CalvoCoins. Para saber como adiquirir CalvoCoins digite{' '}
				<Monospace>!coins help</Monospace>
			</Line>
			<Line></Line>
			<ForEach
				data={aiCommands}
				render={command => (
					<>
						<Line>
							<Bold>{command.name}</Bold>:{' '}
							{command.coins ? `C$${command.coins} calvo coins` : 'Grátis!!!'}
						</Line>
						<Line>{command.description}</Line>
						<Line></Line>
						<Line>Exemplos:</Line>
						<ForEach
							data={command.example}
							render={example => <Monospace>{example}</Monospace>}
						/>
					</>
				)}
			/>
		</>
	);
};

export const ImageStyleUnsupported = ({ style }: { style: string }) => {
	return (
		<>
			<Line>
				Estilo não suportado ou não especificado. A imagem será criada usando o
				estilo {style}
			</Line>
			<Line>
				Para uma lista de estilos, digite <Monospace>!ai image-styles</Monospace>
			</Line>
		</>
	);
};
