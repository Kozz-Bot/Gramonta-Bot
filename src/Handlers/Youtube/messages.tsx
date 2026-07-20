import { Bold, Line } from 'kozz-module-maker';

export const Help = () => (
	<>
		<Line>Esse modulo pesquisa no youtube e baixa o primeiro resultado que encontrar.</Line>
		<Line>!yt song (pesquisa) para baixar como musica</Line>
		<Line>!yt video (pesquisa) para baixar como video</Line>
		<Line>Reacoes:</Line>
		<Line>✅: Comando validado</Line>
		<Line>⏳: Baixando, aguarde</Line>
		<Line>🎶 ou 🎥: Midia baixada, enviando</Line>
	</>
);

export const EmptyQuery = () => <Line>Sua pesquisa nao pode ser vazia.</Line>;

export const NoResults = () => (
	<Line>
		Putz, nao achei nada. Provavelmente a cota de download diaria do youtube foi
		atingida. Tente novamente amanha.
	</Line>
);

export const ErrorMessage = ({ error }: { error: unknown }) => (
	<Line>
		<Bold>Erro:</Bold> {String(error)}
	</Line>
);
