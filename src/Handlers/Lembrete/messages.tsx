import { Bold, Line, Monospace } from 'kozz-module-maker';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';
import type { Reminder } from './store';

export const date = (n: number) =>
	new Intl.DateTimeFormat('pt-BR', {
		timeZone: 'America/Sao_Paulo',
		dateStyle: 'short',
		timeStyle: 'medium',
	}).format(n);
export const Notice = ({ text }: { text: string }) => <Line>{text}</Line>;
export const Help = () => (
	<>
		<Line>
			<Bold>⏰ Lembretes</Bold>
		</Line>
		<Line>Tem algo para fazer mais tarde? Eu te aviso aqui na conversa!</Line>
		<Line />
		<Line>
			<Bold>📝 Comece com um lembrete para você</Bold>
		</Line>
		<Line>
			<Monospace>!lembrete 10m tirar a comida do forno</Monospace>
		</Line>
		<Line>
			Daqui a 10 minutos, envio o aviso neste chat. Se for um grupo, marco você.
		</Line>
		<Line />
		<Line>Escolha o tempo e escreva o que quer lembrar:</Line>
		<Line>
			<Monospace>!lembrete 3h ligar para o João</Monospace>
		</Line>
		<Line>
			<Monospace>!lembrete 1h30m buscar a encomenda</Monospace>
		</Line>
		<Line>
			<Bold>s</Bold> = segundos · <Bold>m</Bold> = minutos · <Bold>h</Bold> = horas ·{' '}
			<Bold>d</Bold> = dias.
		</Line>
		<Line>Também vale 30s ou 2d. Você pode agendar de 10 segundos a 365 dias.</Line>
		<Line />
		<Line>
			<Bold>👥 Quer lembrar outras pessoas do grupo?</Bold>
		</Line>
		<Line>
			<Monospace>!lembrete 1h reunião --pessoas @Ana @João</Monospace>
		</Line>
		<Line>
			Digite @ e selecione cada pessoa na lista do WhatsApp. No horário marcado, o
			aviso chega ao grupo com as pessoas escolhidas marcadas.
		</Line>
		<Line />
		<Line>
			<Bold>💬 Avise também no privado</Bold>
		</Line>
		<Line>
			<Monospace>!lembrete 1h reunião --pessoas @Ana @João --privado</Monospace>
		</Line>
		<Line>
			Ao acrescentar --privado, cada pessoa da lista também recebe uma mensagem
			individual. O aviso no grupo continua valendo.
		</Line>
		<Line>
			Você pode escolher até 20 pessoas. Sem uma lista, o lembrete é para você.
		</Line>
		<Line />
		<Line>
			<Bold>📋 Consulte ou cancele</Bold>
		</Line>
		<Line>
			<Monospace>!lembrete lista</Monospace> — mostra os lembretes pendentes desta
			conversa.
		</Line>
		<Line>
			<Monospace>!lembrete ver CÓDIGO</Monospace> — mostra os detalhes de um
			lembrete.
		</Line>
		<Line>
			<Monospace>!lembrete cancelar CÓDIGO</Monospace> — cancela o lembrete.
		</Line>
		<Line>Troque CÓDIGO pelo código que aparece na confirmação do agendamento.</Line>
		<Line />
		<Line>
			<Bold>✏️ Mudou a lista de pessoas?</Bold>
		</Line>
		<Line>
			<Monospace>!lembrete pessoas CÓDIGO @Ana @João</Monospace>
		</Line>
		<Line>
			Esse comando substitui a lista anterior pelas pessoas que você marcar.
		</Line>
		<Line />
		<Line>Para ligar ou desligar os avisos individuais:</Line>
		<Line>
			<Monospace>!lembrete privado CÓDIGO on</Monospace> — ativa.
		</Line>
		<Line>
			<Monospace>!lembrete privado CÓDIGO off</Monospace> — desativa.
		</Line>
		<Line />
		<Line>
			Só quem criou o lembrete ou o responsável pelo bot pode alterar ou cancelar
			antes do início dos envios.
		</Line>
		<Line>
			Seus lembretes ficam salvos quando o bot reinicia. Se ele estiver fora do ar na
			hora marcada, o aviso fica para quando voltar.
		</Line>
	</>
);
export const Card = ({ reminder: r }: { reminder: Reminder }) => (
	<>
		<Line>
			<Bold>
				⏰ Lembrete{' '}
				{r.status === 'cancelled'
					? 'cancelado'
					: r.status === 'complete'
						? 'processado'
						: r.status === 'dispatching'
							? 'em envio'
							: 'agendado'}
			</Bold>
		</Line>
		<Line>{r.text}</Line>
		<Line>Quando: {date(r.due)} — Brasília</Line>
		<Line>Pessoas: {r.recipients.map(p => tagMember(p.id)).join(', ')}</Line>
		<Line>Avisar também no privado: {r.private ? 'sim' : 'não'}</Line>
		<Line>Código: {r.id}</Line>
		{r.status === 'complete' || r.status === 'dispatching' ? (
			<Line>
				Envios:{' '}
				{r.deliveries
					.map(
						d =>
							`${d.kind === 'origin' ? 'Chat de origem' : '@' + d.chatId.split('@')[0]}: ${{ pending: 'pendente', sending: 'em andamento', submitted: 'submetido', failed: 'falhou', uncertain: 'incerto; confira antes de repetir' }[d.state]}`
					)
					.join('\n')}
				. Submissão não comprova entrega/leitura.
			</Line>
		) : null}
	</>
);
export const List = ({ reminders }: { reminders: Reminder[] }) => (
	<>
		<Line>
			<Bold>⏰ Lembretes pendentes deste chat</Bold>
		</Line>
		<Line>
			{reminders
				.map(
					r =>
						`${r.id} — ${date(r.due)} — ${r.text.replace(/\s+/g, ' ').slice(0, 80)}`
				)
				.join('\n') || 'Nenhum lembrete pendente.'}
		</Line>
		<Line>Detalhes: !lembrete ver CÓDIGO</Line>
	</>
);
const visible = (id: string) => `@${id.split('@')[0]}`;
export const deliveryBody = (r: Reminder, kind: 'origin' | 'private') =>
	[
		'⏰ Lembrete',
		kind === 'private' ? `Do grupo ${r.chatName || 'de origem'}` : '',
		r.text,
		kind === 'origin'
			? `Pessoas: ${r.recipients.map(p => visible(p.id)).join(', ')}`
			: '',
		`Código: ${r.id}`,
	]
		.filter(Boolean)
		.join('\n');
