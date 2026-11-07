import { Bold, Line } from 'kozz-module-maker';
import { Settings, AutoTramontaEngine } from '../../Services/AutoTramonta/engine';

export const Notice = ({ text }: { text: string }) => <Line>{text}</Line>;
export const Help = () => (
	<>
		<Line>
			<Bold>!autotramonta</Bold> — menu do seu assistente de conversa.
		</Line>
		<Line>
			Use no seu chat consigo mesmo. Escolha os grupos, ajuste os intervalos e
			inicie.
		</Line>
		<Line>!autotramonta parar bloqueia também o despertar por menção.</Line>
	</>
);
type GroupStatus = ReturnType<AutoTramontaEngine['status']>[number];
const GroupSummary = ({
	group: g,
	index,
}: {
	group: GroupStatus;
	index: number;
}) => {
	const minutes = g.until
		? Math.max(1, Math.ceil((g.until - Date.now()) / 60000))
		: undefined;
	const state = g.humanPaused
		? '⏸ pausado: você assumiu'
		: g.phase === 'online'
			? '🟢 Online'
			: g.phase === 'offline'
				? '🌙 Em pausa'
				: '⏹ Parado';
	return (
		<>
			<Line>
				<Bold>
					{index + 1}. {g.name.replace(/\s+/g, ' ').slice(0, 80)}
				</Bold>
			</Line>
			<Line>
				{state}
				{minutes
					? g.phase === 'online'
						? ` · mais ${minutes} min`
						: ` · volta em ${minutes} min`
					: ''}
			</Line>
			<Line>
				Novas: {g.pending} · Enviadas: {g.sent}
			</Line>
			{g.lastError ? <Line>⚠️ {g.lastError.slice(0, 120)}</Line> : null}
		</>
	);
};
export const Menu = ({
	settings: s,
	status,
	model,
}: {
	settings: Settings;
	status: ReturnType<AutoTramontaEngine['status']>;
	model: string;
}) => (
	<>
		<Line>
			<Bold>🤖 AutoTramonta — {s.enabled ? 'iniciado' : 'parado'}</Bold>
		</Line>
		<Line>
			{'\n'}
			<Bold>Grupos selecionados ({status.length})</Bold>
		</Line>
		<Line>
			{status.length
				? [
						...status
							.slice(0, 8)
							.map((group, index) => <GroupSummary group={group} index={index} />),
						...(status.length > 8
							? [`Exibindo 8 de ${status.length} grupos selecionados.`]
							: []),
					].join('\n\n')
				: 'Nenhum grupo selecionado. Toque em Grupos para adicionar.'}
		</Line>
		<Line>
			{'\n'}
			<Bold>Ritmo de participação</Bold>
		</Line>
		<Line>Cadência: {s.cadence.join('–')} segundos</Line>
		<Line>
			Online: {s.online.map(n => n / 60).join('–')} min · Offline:{' '}
			{s.offline.map(n => n / 60).join('–')} min
		</Line>
		<Line>Chance de despertar por menção: {s.mentionChance}%</Line>
		<Line>Modelo: {model}</Line>
		<Line>
			{'\n'}
			<Bold>Como funciona</Bold>
		</Line>
		<Line>
			Sem mensagens novas de outras pessoas, não responde. Os intervalos variam
			dentro das faixas.
		</Line>
		<Line>
			Se você mandar mensagem no grupo, a IA pausa até a próxima janela online.
		</Line>
		<Line>Comandos: !autotramonta iniciar · parar · grupos · ajustes</Line>
	</>
);
export const SettingsMenu = () => (
	<>
		<Line>
			<Bold>Ajustes do AutoTramonta</Bold>
		</Line>
		<Line>Use os botões para predefinições ou digite:</Line>
		<Line>!autotramonta cadencia 45 120 — segundos</Line>
		<Line>!autotramonta online 5 15 — minutos</Line>
		<Line>!autotramonta offline 15 45 — minutos</Line>
		<Line>!autotramonta chance 35 — porcentagem</Line>
		<Line>!autotramonta — voltar ao menu</Line>
	</>
);
export const GroupCard = ({
	group,
	selected,
	index,
	count,
	search,
}: {
	group: { id: string; name: string };
	selected: boolean;
	index: number;
	count: number;
	search: string;
}) => (
	<>
		<Line>
			<Bold>
				📋 Escolher grupos · {index + 1} de {count}
			</Bold>
		</Line>
		<Line>
			{'\n'}
			<Bold>{group.name.replace(/\s+/g, ' ').slice(0, 100)}</Bold>
		</Line>
		<Line>{selected ? '✅ Selecionado para responder' : '➖ Não selecionado'}</Line>
		<Line>{'\n'}Buscar: !autotramonta buscar nome do grupo</Line>
		{search ? <Line>Busca atual: {search}</Line> : null}
		<Line>!autotramonta grupos — todos os grupos</Line>
	</>
);
