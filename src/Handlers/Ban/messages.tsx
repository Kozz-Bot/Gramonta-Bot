import { Bold, Line } from 'kozz-module-maker';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';
import type { BotBan } from '../../Services/Bans/store';

export const BanListHeader = ({ count }: { count: number }) => (
	<Line>
		{count ? `Banimentos do bot: ${count}` : 'Nenhuma pessoa está banida do bot.'}
	</Line>
);
export const BanEntry = ({ ban }: { ban: BotBan }) => (
	<>
		<Line>{tagMember(ban.id)}</Line>
		<Line>Motivo: {ban.reason}</Line>
		<Line>
			Desde:{' '}
			{new Date(ban.bannedAt).toLocaleString('pt-BR', {
				timeZone: 'America/Sao_Paulo',
			})}{' '}
			(Brasília)
		</Line>
	</>
);

export const Feedback = ({ text }: { text: string }) => <Line>{text}</Line>;
export const Changed = ({ id, reason }: { id: string; reason?: string }) => (
	<>
		<Line>
			{tagMember(id)}: {reason ? 'acesso ao bot banido.' : 'acesso ao bot liberado.'}
		</Line>
		{reason && <Line>Motivo: {reason}</Line>}
	</>
);
export const Help = () => (
	<>
		<Line>
			<Bold>Banimento do bot</Bold>
		</Line>
		<Line>
			O dono do bot pode bloquear uma pessoa permanentemente em todos os grupos e no
			privado.
		</Line>
		<Line />
		<Line>
			<Bold>Bloquear</Bold>
		</Line>
		<Line>!ban @Pessoa --reason Desrespeito às regras</Line>
		<Line>
			Digite @ e selecione o contato no WhatsApp. Depois de --reason, escreva o
			motivo, que será salvo.
		</Line>
		<Line />
		<Line>
			<Bold>Liberar</Bold>
		</Line>
		<Line>!unban @Pessoa</Line>
		<Line />
		<Line>
			<Bold>Consultar</Bold>
		</Line>
		<Line>!banlist</Line>
		<Line>Mostra as pessoas banidas, os motivos e as datas dos banimentos.</Line>
		<Line>
			Também aceita --targetId +5511999990000, com país e DDD, no lugar da marcação.
		</Line>
		<Line>O bloqueio impede comandos do bot e não expulsa a pessoa do grupo.</Line>
	</>
);
