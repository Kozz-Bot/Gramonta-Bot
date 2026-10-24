import { Bold, Line, Monospace } from 'kozz-module-maker';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';

export const Feedback = ({ text }: { text: string }) => <Line>{text}</Line>;
export const MutedNotice = ({ id, expiration, reason }: { id: string; expiration: string; reason: string }) => (
	<Line>{tagMember(id)}, você está silenciado do grupo até {expiration}. Motivo: {reason}</Line>
);
export const MuteChanged = ({ id, expiration }: { id: string; expiration?: string }) => (
	<Line>{tagMember(id)}: {expiration ? `silenciado neste grupo até ${expiration}.` : 'mute revogado neste grupo.'}</Line>
);
export const Help = () => (
	<>
		<Line><Bold>Mute — apenas o dono do bot, em grupos</Bold></Line>
		<Line><Monospace>!mute @usuário [--time minutos] [--reason motivo]</Monospace></Line>
		<Line>O padrão é 5 minutos, sem motivo informado. Vale somente neste grupo.</Line>
		<Line><Monospace>!unmute @usuário</Monospace> revoga o mute.</Line>
		<Line><Monospace>!mutemais @usuário [--time minutos] [--reason motivo]</Monospace> acrescenta tempo ao vencimento atual (padrão: 5 minutos).</Line>
		<Line>Também: !mute unmute e !mute extend. As mensagens são apagadas e o aviso é enviado no máximo uma vez por minuto por usuário neste grupo.</Line>
	</>
);
