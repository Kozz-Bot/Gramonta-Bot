import { Bold, Line } from 'kozz-module-maker';

export const EmptyQuery = () => (
	<>
		<Line>
			<Bold>Erro</Bold>
		</Line>
		<Line>Voce precisa tentar adivinhar uma palavra.</Line>
	</>
);

export const InvalidGuess = () => (
	<>
		<Line>
			<Bold>Erro</Bold>
		</Line>
		<Line>Essa palavra nao esta no dicionario de chutes validos.</Line>
	</>
);

export const GameOver = () => (
	<>
		<Line>
			<Bold>Voce ja jogou hoje!</Bold>
		</Line>
		<Line>Volte amanha para jogar novamente</Line>
	</>
);

export const Win = ({ tries, history }: { tries: number; history: string }) => (
	<>
		<Line>
			<Bold>Voce venceu!</Bold>
		</Line>
		<Line>Tentativas usadas: {tries}</Line>
		<Line>{history}</Line>
	</>
);

export const GuessResult = ({ tries, history }: { tries: number; history: string }) => (
	<>
		<Line>
			<Bold>Wordle</Bold>
		</Line>
		<Line>Chute {tries} de 6</Line>
		<Line>{history}</Line>
	</>
);

export const Help = () => (
	<>
		<Line>
			<Bold>Wordle</Bold>
		</Line>
		<Line>Digite `!wordle {'{palavra}'}` para jogar.</Line>
		<Line>Caso precise, digite `!wordle resend` para que o bot reenvie o status do seu jogo.</Line>
		<Line>Voce possui uma palavra por grupo por dia. Apenas um jogo por dia em cada um dos grupos que estiver.</Line>
		<Line>Caso voce queira saber como jogar o jogo, https://canaltech.com.br/jogos-para-pc/o-que-e-wordle-como-jogar-205876/</Line>
	</>
);
