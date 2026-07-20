import { Bold, Line } from 'kozz-module-maker';

export const Help = () => (
	<>
		<Line>Digite !tia seguido de palavras chaves para eu enviar uma mensagem de tia do zap!</Line>
		<Line>_Exemplo_:</Line>
		<Line>- `!tia bom dia`</Line>
		<Line>- `!tia feliz aniversario`</Line>
		<Line>- `!tia sexta feira`</Line>
	</>
);

export const TextMessage = ({ title, text }: { title: string; text: string }) => (
	<>
		<Line>{title}</Line>
		<Line />
		<Line>{text}</Line>
	</>
);

export const ErrorMessage = ({ error }: { error: unknown }) => (
	<>
		<Line>
			<Bold>Erro:</Bold>
		</Line>
		<Line>Erro desconhecido: {String(error)}</Line>
	</>
);
