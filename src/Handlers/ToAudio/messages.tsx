import { Bold, Line } from 'kozz-module-maker';

export const Help = () => (
	<>
		<Line>
			<Bold>!toaudio</Bold> — extrai o áudio de um vídeo e envia como mensagem de voz
			em OGG/Opus.
		</Line>
		<Line>Responda (cite) um vídeo com !toaudio. Use !toaudio help para ajuda.</Line>
		<Line>
			Limites: vídeo de até 64 MB e 10 minutos; áudio extraído de até 16 MB.
		</Line>
	</>
);

export const ErrorMessage = ({ message }: { message: string }) => (
	<Line>❌ {message}</Line>
);

export const Processing = () => <Line>⏳ Extraindo o áudio do vídeo...</Line>;
