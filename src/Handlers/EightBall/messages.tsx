import { Bold, Line } from 'kozz-module-maker';

export const answers = [
	'Com certeza!',
	'Sem dúvida.',
	'Pode contar com isso.',
	'Sim, definitivamente.',
	'Tudo indica que sim.',
	'As perspectivas são boas.',
	'Eu diria que sim.',
	'É muito provável.',
	'Os sinais apontam que sim.',
	'Sim!',
	'A resposta está nebulosa. Tente de novo.',
	'Pergunte novamente mais tarde.',
	'Melhor não te contar agora.',
	'Não consigo prever agora.',
	'Concentre-se e pergunte novamente.',
	'Não conte com isso.',
	'Minha resposta é não.',
	'Minhas fontes dizem que não.',
	'As perspectivas não são boas.',
	'É muito duvidoso.',
];

export const Help = () => (
	<>
		<Line>
			<Bold>🎱 Bola 8 mágica</Bold>
		</Line>
		<Line>Faça uma pergunta de sim ou não e receba uma resposta aleatória.</Line>
		<Line>
			Exemplo: <Bold>!8ball Vou ter sorte hoje?</Bold>
		</Line>
		<Line>Troque a pergunta do exemplo pela sua. É só uma brincadeira!</Line>
	</>
);

export const Result = ({ answer }: { answer: string }) => <Line>🎱 {answer}</Line>;
