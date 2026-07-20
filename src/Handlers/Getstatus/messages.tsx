import { Bold, Line } from 'kozz-module-maker';

export const Instructions = () => (
	<Line>Responda um status para eu enviar sua mídia</Line>
);

export const ErrorMessage = ({ error }: { error: string }) => (
	<>
		<Line>
			<Bold>Erro!</Bold>
		</Line>
		<Line>{error}</Line>
	</>
);
