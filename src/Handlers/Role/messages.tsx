import { Bold, Line } from 'kozz-module-maker';
import { formatDate, RoleEvent } from './events';

export const Notice = ({ text }: { text: string }) => <Line>{text}</Line>;
export const Help = () => (
	<>
		<Line>
			<Bold>📅 !evento — publique o evento do grupo</Bold>
		</Line>
		<Line>!evento Churrasco | 07/11/2026 14h | Casa do João</Line>
		<Line>
			Com arte: coloque o comando na legenda da imagem ou responda à foto com o
			comando. Até 8 MB e 16 megapixels.
		</Line>
		<Line>
			A arte marca todos os participantes; logo depois vem o evento nativo do
			WhatsApp. Sem arte, envia somente o evento.
		</Line>
		<Line>
			Confirme presença, adicione ao calendário e acompanhe lembretes no próprio
			evento do WhatsApp.
		</Line>
		<Line>
			Horário de Brasília. Término opcional: 07/11/2026 14:00-18:00. Sem término,
			dura 2 horas; término anterior ao início indica o dia seguinte.
		</Line>
		<Line>!evento lista · !evento ver CÓDIGO</Line>
		<Line>!evento editar CÓDIGO Título | DD/MM/AAAA HHhMM | Local</Line>
		<Line>!evento cancelar CÓDIGO — somente organizador ou dono do bot.</Line>
		<Line>
			Use em grupos. Até 20 eventos ativos por grupo, com data nos próximos 366 dias.
		</Line>
	</>
);
export const Card = ({ event: e }: { event: RoleEvent }) => (
	<>
		<Line>
			<Bold>
				{e.cancelled ? '❌ Cancelado: ' : '📅 '}
				{e.title}
			</Bold>
		</Line>
		<Line>
			🕒 {formatDate(e.start)} até {formatDate(e.end)} — Brasília
		</Line>
		<Line>📍 {e.location}</Line>
		<Line>Código: {e.id}</Line>
		<Line>
			{e.nativeState === 'submitted'
				? 'Presença e calendário: abra o evento nos detalhes do grupo do WhatsApp.'
				: '⚠️ Publicação não confirmada. Confira a arte e os eventos do grupo antes de repetir.'}
		</Line>
	</>
);
export const EventList = ({ events }: { events: RoleEvent[] }) => (
	<>
		<Line>
			<Bold>📅 Próximos rolês</Bold>
		</Line>
		<Line>
			{events.length
				? events.map(e => `${e.id} — ${e.title} — ${formatDate(e.start)}`).join('\n')
				: 'Nenhum rolê marcado. Crie um com !evento Título | DD/MM/AAAA HHhMM | Local'}
		</Line>
		<Line>
			Detalhes: !evento ver CÓDIGO. Presença e calendário ficam no evento nativo do
			WhatsApp.
		</Line>
	</>
);
