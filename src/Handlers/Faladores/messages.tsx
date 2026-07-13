import {
	Bold,
	ForEach,
	Line,
	ListItem,
	Monospace,
	Render,
} from 'kozz-module-maker';

export type RankingEntry = {
	contactId: string;
	count: number;
};

export type RankingSection = {
	label: string;
	entries: RankingEntry[];
};

const formatCount = (count: number) =>
	count === 1 ? '1 mensagem' : `${count} mensagens`;

export const Help = () => {
	return (
		<>
			<Line>
				<Bold>Faladores</Bold>
			</Line>
			<Line>Mostra quem mais falou no grupo usando as mensagens salvas.</Line>
			<Line />
			<Line>
				<ListItem>
					<Monospace>!faladores</Monospace> mostra o top 5 do dia, da semana e do
					mês.
				</ListItem>
			</Line>
			<Line>
				<ListItem>
					<Monospace>!faladores dia</Monospace> mostra o ranking diário completo.
				</ListItem>
			</Line>
			<Line>
				<ListItem>
					<Monospace>!faladores semana</Monospace> mostra o ranking semanal
					completo.
				</ListItem>
			</Line>
			<Line>
				<ListItem>
					<Monospace>!faladores mes</Monospace> mostra o ranking mensal completo.
				</ListItem>
			</Line>
			<Line>
				<ListItem>
					<Monospace>!faladores geral</Monospace> mostra o ranking geral completo.
				</ListItem>
			</Line>
			<Line>
				<ListItem>
					<Monospace>!faladores help</Monospace> mostra esta ajuda.
				</ListItem>
			</Line>
			<Line>
				<ListItem>
					<Monospace>!mudos</Monospace> mostra quem ainda nao falou hoje.
				</ListItem>
			</Line>
			<Line>
				<ListItem>
					<Monospace>!mudos mes</Monospace> tambem aceita dia, semana, mes ou
					geral.
				</ListItem>
			</Line>
			<Line />
			<Line>
				Os contatos do ranking e do <Bold>!mudos</Bold> são marcados na resposta.
			</Line>
		</>
	);
};

export const GroupOnly = () => {
	return (
		<>
			<Line>
				Esse comando só funciona em grupos.
			</Line>
		</>
	);
};

export const LoadingError = () => {
	return (
		<>
			<Line>
				Não consegui buscar os dados de mensagens desse grupo agora.
			</Line>
		</>
	);
};

export const InvalidPeriod = ({ period }: { period: string }) => {
	return (
		<>
			<Line>
				Período <Bold>{period}</Bold> inválido.
			</Line>
			<Line>
				Use <Monospace>!faladores help</Monospace> para ver as opções.
			</Line>
		</>
	);
};

const RankingBlock = ({ section }: { section: RankingSection }) => {
	return (
		<>
			<Line>
				<Bold>{section.label}</Bold>
			</Line>
			<Render when={section.entries.length === 0}>
				<Line>Ninguém falou nesse período.</Line>
			</Render>
			<Render when={section.entries.length > 0}>
				<ForEach
					data={section.entries}
					render={(entry, index) => (
						<Line>
							{(index + 1).toString().padStart(2, '0')}. {entry.contactId} -{' '}
							{formatCount(entry.count)}
						</Line>
					)}
				/>
			</Render>
		</>
	);
};

export const SummaryRankings = ({
	groupName,
	sections,
	mutedContacts,
}: {
	groupName: string;
	sections: RankingSection[];
	mutedContacts: string[];
}) => {
	return (
		<>
			<Line>
				<Bold>Faladores de {groupName}</Bold>
			</Line>
			<Line />
			<ForEach
				data={sections}
				render={(section, index) => (
					<>
						<RankingBlock section={section} />
						<Render when={index !== sections.length - 1}>
							<Line />
						</Render>
					</>
				)}
			/>
			<Line />
			<Line>
				<Bold>!mudos de hoje</Bold>
			</Line>
			<Render when={mutedContacts.length === 0}>
				<Line>Todo mundo já apareceu na store hoje.</Line>
			</Render>
			<Render when={mutedContacts.length > 0}>
				<Line>{mutedContacts.join(' ')}</Line>
			</Render>
		</>
	);
};

export const FullRanking = ({
	groupName,
	section,
	mutedContacts,
}: {
	groupName: string;
	section: RankingSection;
	mutedContacts: string[];
}) => {
	return (
		<>
			<Line>
				<Bold>Faladores de {groupName}</Bold>
			</Line>
			<Line />
			<RankingBlock section={section} />
			<Line />
			<Line>
				<Bold>!mudos</Bold>
			</Line>
			<Render when={mutedContacts.length === 0}>
				<Line>Todo mundo já apareceu na store nesse período.</Line>
			</Render>
			<Render when={mutedContacts.length > 0}>
				<Line>{mutedContacts.join(' ')}</Line>
			</Render>
		</>
	);
};

export const MutedOnly = ({
	groupName,
	periodLabel,
	mutedContacts,
}: {
	groupName: string;
	periodLabel: string;
	mutedContacts: string[];
}) => {
	return (
		<>
			<Line>
				<Bold>!mudos de {groupName}</Bold>
			</Line>
			<Line>{periodLabel}</Line>
			<Line />
			<Render when={mutedContacts.length === 0}>
				<Line>Todo mundo já apareceu na store nesse período.</Line>
			</Render>
			<Render when={mutedContacts.length > 0}>
				<Line>{mutedContacts.join(' ')}</Line>
			</Render>
		</>
	);
};
