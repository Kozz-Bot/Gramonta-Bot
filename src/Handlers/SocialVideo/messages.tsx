import { Bold, Line } from 'kozz-module-maker';
import { Platform, platforms } from '../../Services/SocialVideo/urls';

export const VideoHelp = ({ platform }: { platform: Platform }) => {
	const config = platforms[platform];
	return (
		<>
			<Line>
				<Bold>/{config.command} link</Bold> — baixa um vídeo público do{' '}
				{config.label}.
			</Line>
			<Line>
				Exemplo: /{config.command} {config.example}
			</Line>
			<Line>
				Ou responda à mensagem com o link usando !{config.command}, sem argumentos.
				Pode colar o texto completo do compartilhamento.
			</Line>
			<Line>
				Até 32 MB e 10 minutos; prazo de download de 2 minutos. Em posts com vários
				vídeos, baixa o primeiro.
			</Line>
			<Line>
				Não baixa conteúdo que exige login. Fotos, stories e transmissões ao vivo não
				são aceitos.
			</Line>
		</>
	);
};
export const ErrorMessage = ({ message }: { message: string }) => (
	<Line>❌ {message}</Line>
);
export const Processing = ({ label }: { label: string }) => (
	<Line>⏳ Baixando o vídeo do {label}...</Line>
);
