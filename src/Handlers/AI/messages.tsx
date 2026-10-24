import { Bold, Line, Monospace } from 'kozz-module-maker';

export const Help = () => {
	return (
		<>
			<Line>
				<Bold>Inteligência artificial</Bold>
			</Line>
			<Line>
				Use <Monospace>!ai</Monospace> seguido do que você quer pedir ao
				CalvoGPT.
			</Line>
			<Line />
			<Line>
				Exemplos: <Monospace>!ai resume a conversa</Monospace>
			</Line>
			<Line>
				<Monospace>!ai cria uma imagem de um gato jogando basquete</Monospace>
			</Line>
			<Line>
				Envie ou cite uma imagem com{' '}
				<Monospace>!ai muda o fundo para azul</Monospace> para editá-la.
			</Line>
			<Line>
				<Monospace>!ai transcreve esse áudio</Monospace>
			</Line>
			<Line>
				<Monospace>!ai usage</Monospace> mostra uso recente, tokens e erros
			</Line>
		</>
	);
};
