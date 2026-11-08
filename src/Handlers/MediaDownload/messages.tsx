import { Bold, Line } from 'kozz-module-maker';
import type { DownloadMode } from '../../Services/MediaDownload/urls';

export const Help = ({ mode }: { mode: DownloadMode }) => (
	<>
		<Line>
			<Bold>!{mode} LINK</Bold> —{' '}
			{mode === 'audio' ? 'baixa e envia o áudio' : 'baixa e envia o vídeo'} de um
			site público compatível.
		</Line>
		<Line>Exemplo: !{mode} https://www.facebook.com/share/v/1CF64Dn7B3/</Line>
		<Line>Também pode responder à mensagem com o link usando apenas !{mode}.</Line>
		<Line>
			Para buscar no YouTube, escreva o nome: !{mode} Beethoven Moonlight Sonata
		</Line>
		<Line>
			Até 10 minutos; vídeo de até 32 MB e áudio de até 16 MB. Em publicações com
			várias mídias, baixa a primeira disponível.
		</Line>
		<Line>
			Alguns sites podem bloquear downloads. Conteúdo privado, transmissões ao vivo e
			arquivos que exigem login não são aceitos.
		</Line>
	</>
);
export const Migration = () => (
	<Line>
		⚠️ Este comando será removido. Use <Bold>!video LINK</Bold> para vídeo ou{' '}
		<Bold>!audio LINK</Bold> para áudio. Também aceitam links citados e buscas no
		YouTube por nome.
	</Line>
);
export const Processing = ({ mode }: { mode: DownloadMode }) => (
	<Line>⏳ Baixando {mode === 'audio' ? 'o áudio' : 'o vídeo'}...</Line>
);
export const ErrorMessage = ({ message }: { message: string }) => (
	<Line>❌ {message}</Line>
);
