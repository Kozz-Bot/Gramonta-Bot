import { Bold, Line } from 'kozz-module-maker';

export const Help = () => (
	<Line>Responda uma mensagem de visualizacao unica com `!reveal` para eu revelar seu conteudo</Line>
);

export const ErrorMessage = ({ error }: { error: string }) => (
	<>
		<Line>
			<Bold>Erro!</Bold>
		</Line>
		<Line>{error}</Line>
	</>
);
