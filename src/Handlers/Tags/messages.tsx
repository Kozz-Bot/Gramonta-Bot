import { Bold, Line, Monospace } from 'kozz-module-maker';

export const HostOnly = () => (
	<>
		<Line>Apenas o dono do bot pode usar esse comando.</Line>
	</>
);

export const Help = () => (
	<>
		<Line>
			<Bold>Tags</Bold>
		</Line>
		<Line>Guarda marcações em chats silenciados e gera um resumo depois.</Line>
		<Line />
		<Line>
			<Monospace>!tags silence</Monospace> alterna o silêncio de tags neste chat.
		</Line>
		<Line>
			<Monospace>!tags summary</Monospace> resume as marcações salvas e limpa o
			histórico.
		</Line>
	</>
);

export const SilenceEnabled = ({ chatName }: { chatName: string }) => (
	<>
		<Line>
			<Bold>Tags silenciadas</Bold>
		</Line>
		<Line>
			Vou marcar como lidas as mensagens que responderem você ou te mencionarem em{' '}
			<Bold>{chatName}</Bold>.
		</Line>
		<Line>Elas entram no próximo resumo de tags.</Line>
	</>
);

export const SilenceDisabled = ({ chatName }: { chatName: string }) => (
	<>
		<Line>
			<Bold>Tags ativas</Bold>
		</Line>
		<Line>
			Não vou mais interceptar marcações em <Bold>{chatName}</Bold>.
		</Line>
	</>
);

export const EmptySummary = () => (
	<>
		<Line>
			<Bold>Nenhuma tag pendente</Bold>
		</Line>
		<Line>Não há marcações salvas em chats silenciados.</Line>
	</>
);

export const SummaryError = () => (
	<>
		<Line>
			<Bold>Erro ao resumir tags</Bold>
		</Line>
		<Line>Não consegui gerar o resumo agora. O histórico foi preservado.</Line>
	</>
);

export const Summary = ({ content }: { content: string }) => (
	<>
		<Line>
			<Bold>Resumo das tags silenciadas</Bold>
		</Line>
		<Line />
		<Line>{content}</Line>
	</>
);
