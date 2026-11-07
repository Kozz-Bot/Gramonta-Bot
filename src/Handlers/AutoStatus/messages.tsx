import { Bold, Line } from 'kozz-module-maker';
import type {
	GroupSettings,
	PeriodicGroup,
} from '../../Services/PeriodicStatus/groups';

export const Notice = ({ text }: { text: string }) => <Line>{text}</Line>;
export const Help = () => (
	<>
		<Line>
			<Bold>!autostatus</Bold> — gerencia as mídias periódicas nos grupos.
		</Line>
		<Line>Use no chat da própria conta consigo mesma.</Line>
		<Line>
			!autostatus grupos · buscar nome · selecionados · agenda · iniciar · parar
		</Line>
		<Line>
			Todos os grupos selecionados recebem a agenda completa. Os Status continuam
			independentes.
		</Line>
	</>
);
export const Menu = ({ settings: s }: { settings: GroupSettings }) => (
	<>
		<Line>
			<Bold>📅 AutoStatus — grupos {s.enabled ? 'iniciados' : 'parados'}</Bold>
		</Line>
		<Line>Grupos selecionados: {s.groups.length}</Line>
		<Line>
			{s.groups
				.slice(0, 10)
				.map(g => g.name.replace(/\s+/g, ' ').slice(0, 80))
				.join('\n') || 'Nenhum grupo selecionado.'}
		</Line>
		{s.groups.length > 10 ? (
			<Line>Veja todos com !autostatus selecionados.</Line>
		) : null}
		<Line>
			As mesmas mídias dos Status serão enviadas como mensagens nos grupos, nos
			horários de Brasília.
		</Line>
		<Line>
			!autostatus grupos · buscar nome · selecionados · agenda · iniciar · parar
		</Line>
		<Line>
			Parar bloqueia os próximos envios aos grupos. Um envio já em andamento pode
			terminar.
		</Line>
		<Line>Os envios de Status continuam com a agenda atual.</Line>
	</>
);
export const GroupCard = ({
	group,
	selected,
	index,
	count,
}: {
	group: PeriodicGroup;
	selected: boolean;
	index: number;
	count: number;
}) => (
	<>
		<Line>
			<Bold>
				📋 Grupos · {index + 1} de {count}
			</Bold>
		</Line>
		<Line>{group.name.replace(/\s+/g, ' ').slice(0, 100)}</Line>
		<Line>{selected ? '✅ Selecionado' : '➖ Não selecionado'}</Line>
		<Line>
			!autostatus {selected ? 'remover' : 'adicionar'} {group.id}
		</Line>
		<Line>!autostatus pagina {(index + 1) % count} — próximo</Line>
		<Line>!autostatus buscar nome · grupos · selecionados</Line>
	</>
);
export const Agenda = () => (
	<>
		<Line>
			<Bold>Agenda completa — horário de Brasília</Bold>
		</Line>
		<Line>Todos os dias: 00:00</Line>
		<Line>Segunda: 12:00 · Terça: 11:00 · Quarta: 16:00</Line>
		<Line>Quinta: 11:00 · Sexta: 10:00 · Sábado: 10:00 · Domingo: 23:18</Line>
		<Line>
			14 envios por semana por grupo. Vídeo de sábado limitado aos primeiros 90
			segundos.
		</Line>
		<Line>
			Atrasos menores que 15 minutos podem ser recuperados, inclusive ao iniciar ou
			adicionar grupos. O histórico impede repetir o mesmo item/data/grupo.
		</Line>
		<Line>!autostatus — menu</Line>
	</>
);
