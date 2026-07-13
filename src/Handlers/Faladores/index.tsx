import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';
import { CommandAlias, GroupChat } from 'kozz-types';
import {
	FullRanking,
	GroupOnly,
	Help,
	InvalidPeriod,
	LoadingError,
	MutedOnly,
	RankingEntry,
	RankingSection,
	SummaryRankings,
} from './messages';

type MessageCount = {
	contactId: string;
	count: number;
	aliases?: string[];
};

type Period = 'dia' | 'semana' | 'mes' | 'geral';

const periodLabels: Record<Period, string> = {
	dia: 'Hoje',
	semana: 'Semana',
	mes: 'Mês',
	geral: 'Geral',
};

const aliases: CommandAlias[] = [
	{
		name: 'mudos',
		target: {
			method: 'mudos',
		},
	},
];

const startOfDay = () => {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	return date.getTime();
};

const startOfWeek = () => {
	const date = new Date();
	const day = date.getDay();
	const diff = day === 0 ? 6 : day - 1;
	date.setDate(date.getDate() - diff);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
};

const startOfMonth = () => {
	const date = new Date();
	date.setDate(1);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
};

const getPeriodStart = (period: Period) => {
	if (period === 'dia') return startOfDay();
	if (period === 'semana') return startOfWeek();
	if (period === 'mes') return startOfMonth();
	return 0;
};

const isGroupMessage = (chatId: string) => chatId.includes('@g.us');

const getChatId = (requester: MessageObj) =>
	requester.message.chatId || requester.message.to;

const asGroupChat = (response: unknown) => response as GroupChat | null | undefined;

const asMessageCounts = (response: unknown) => (response ?? []) as MessageCount[];

const tagEntries = (counts: MessageCount[]): RankingEntry[] =>
	counts.map(({ contactId, count }) => ({
		contactId: tagMember(contactId),
		count,
	}));

const getMutedContacts = (members: string[], counts: MessageCount[]) => {
	const talkingContactIds = new Set(
		counts.flatMap(({ contactId, aliases }) => [contactId, ...(aliases ?? [])])
	);

	return members
		.filter(member => !talkingContactIds.has(member))
		.map(member => tagMember(member));
};

const getGroupMembers = (groupData: GroupChat | null | undefined) =>
	groupData?.participants?.map(participant => participant.id) ?? [];

const askMessageCount = async (
	requester: MessageObj,
	period: Period,
	chatId: string
) => {
	const response = await requester.ask.boundary(
		requester.message.boundaryId,
		'message_count',
		{
			chatId,
			startTimestamp: getPeriodStart(period),
		}
	);

	return asMessageCounts(response.response);
};

const createSection = (
	period: Period,
	counts: MessageCount[],
	limit?: number
): RankingSection => ({
	label: periodLabels[period],
	entries: tagEntries(typeof limit === 'number' ? counts.slice(0, limit) : counts),
});

const parsePeriod = (period?: string | null): Period | null => {
	if (!period) return 'dia';

	const normalizedPeriod = period.toLowerCase().trim();
	if (normalizedPeriod === 'dia') return 'dia';
	if (normalizedPeriod === 'semana') return 'semana';
	if (normalizedPeriod === 'mes') return 'mes';
	if (normalizedPeriod === 'geral') return 'geral';

	return null;
};

const replySummary = createMethod('default', async requester => {
	const chatId = getChatId(requester);
	if (!isGroupMessage(chatId)) {
		return requester.reply(<GroupOnly />);
	}

	try {
		const [groupResponse, dailyCounts, weeklyCounts, monthlyCounts] =
			await Promise.all([
				requester.ask.boundary(requester.message.boundaryId, 'group_chat_info', {
					id: chatId,
				}),
				askMessageCount(requester, 'dia', chatId),
				askMessageCount(requester, 'semana', chatId),
				askMessageCount(requester, 'mes', chatId),
			]);
		const group = asGroupChat(groupResponse.response);
		const members = getGroupMembers(group);

		return requester.reply(
			<SummaryRankings
				groupName={group?.name ?? requester.message.groupName ?? 'grupo'}
				sections={[
					createSection('dia', dailyCounts, 5),
					createSection('semana', weeklyCounts, 5),
					createSection('mes', monthlyCounts, 5),
				]}
				mutedContacts={getMutedContacts(members, dailyCounts)}
			/>
		);
	} catch (e) {
		return requester.reply(<LoadingError />);
	}
});

const replyPeriod = (period: Period) =>
	createMethod(period, async requester => {
		const chatId = getChatId(requester);
		if (!isGroupMessage(chatId)) {
			return requester.reply(<GroupOnly />);
		}

		try {
			const [groupResponse, counts] = await Promise.all([
				requester.ask.boundary(requester.message.boundaryId, 'group_chat_info', {
					id: chatId,
				}),
				askMessageCount(requester, period, chatId),
			]);
			const group = asGroupChat(groupResponse.response);
			const members = getGroupMembers(group);

			return requester.reply(
				<FullRanking
					groupName={group?.name ?? requester.message.groupName ?? 'grupo'}
					section={createSection(period, counts)}
					mutedContacts={getMutedContacts(members, counts)}
				/>
			);
		} catch (e) {
			return requester.reply(<LoadingError />);
		}
	});

const help = createMethod('help', requester => requester.reply(<Help />));

const muted = createMethod('mudos', async requester => {
	const chatId = getChatId(requester);
	if (!isGroupMessage(chatId)) {
		return requester.reply(<GroupOnly />);
	}

	const period = parsePeriod(requester.rawCommand?.immediateArg);
	if (!period) {
		return requester.reply(
			<InvalidPeriod
				period={requester.rawCommand?.immediateArg ?? 'desconhecido'}
			/>
		);
	}

	try {
		const [groupResponse, counts] = await Promise.all([
			requester.ask.boundary(requester.message.boundaryId, 'group_chat_info', {
				id: chatId,
			}),
			askMessageCount(requester, period, chatId),
		]);
		const group = asGroupChat(groupResponse.response);
		const members = getGroupMembers(group);

		return requester.reply(
			<MutedOnly
				groupName={group?.name ?? requester.message.groupName ?? 'grupo'}
				periodLabel={periodLabels[period]}
				mutedContacts={getMutedContacts(members, counts)}
			/>
		);
	} catch (e) {
		return requester.reply(<LoadingError />);
	}
});

const fallback = createMethod('fallback', requester => {
	return requester.reply(
		<InvalidPeriod period={requester.rawCommand?.method ?? 'desconhecido'} />
	);
});

export const startFaladoresHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...replySummary,
				...replyPeriod('dia'),
				...replyPeriod('semana'),
				...replyPeriod('mes'),
				...replyPeriod('geral'),
				...muted,
				...help,
				...fallback,
			},
			aliases,
		},
		name: 'faladores',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => <Help />);

	return instance;
};
