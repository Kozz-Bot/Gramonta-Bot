import { createMethod, createModule } from 'kozz-module-maker';
import { useJsonDB } from 'src/Utils/StaticJsonDb';
import { randomUUID } from 'crypto';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';
import { RankingMessage, Total } from './messages';
import { ContactPayload } from 'kozz-types';

const __POOP_GROUP_ID__ = '120363421366397068@g.us';

export type Poop = {
	id: string;
	contactId: string;
	timestamp: number;
};

const poopDB = useJsonDB<Poop, 'poops'>('poops', './src/Handlers/Poop/poopDB.json');

const defaultMethod = createMethod('default', requester => {
	if (requester.message.chatId !== __POOP_GROUP_ID__) {
		return;
	}

	poopDB.addEntity({
		id: randomUUID(),
		contactId: requester.message.contact.id,
		timestamp: new Date().getTime(),
	});

	return requester.reply('Cagada confirmada!');
});

const total = createMethod('total', requester => {
	if (requester.message.chatId !== __POOP_GROUP_ID__) {
		return;
	}

	const poops = poopDB
		.getAllEntities()
		.filter(poop => poop.contactId === requester.message.contact.id);

	if (poops.length === 0) {
		return requester.reply('Você não cagou ainda???');
	}

	return requester.reply(<Total total={poops.length} />);
});

const history = createMethod('history', requester => {
	if (requester.message.chatId !== __POOP_GROUP_ID__) {
		return;
	}

	const poops = poopDB
		.getAllEntities()
		.filter(poop => poop.contactId === requester.message.contact.id);

	if (poops.length === 0) {
		return requester.reply('Você não cagou ainda???');
	}

	return requester.reply(
		`*Histórico de cagadas de ${requester.message.contact.publicName}*\n` +
			poops
				.map((poop, index) => {
					return `- Cagada ${index + 1}: ${new Date(poop.timestamp).toLocaleString(
						'pt-BR'
					)}`;
				})
				.join('\n\n')
	);
});

const ranking = createMethod('ranking', async requester => {
	if (requester.message.chatId !== __POOP_GROUP_ID__) {
		return;
	}

	const ranking: Record<string, number> = {};

	poopDB.getAllEntities().forEach(poop => {
		ranking[poop.contactId] = ranking[poop.contactId]
			? ranking[poop.contactId] + 1
			: 1;
	});

	const rankingArray = await Promise.all(
		Object.entries(ranking)
			.sort((a, b) => b[1] - a[1])
			.map(async ([id, count]) => {
				const contactInfo = await requester.ask.boundary(
					'kozz-baileys',
					'contact_info',
					{ id }
				);
				const publicName =
					(contactInfo.response as ContactPayload | null)?.publicName || id;

				return [publicName, count] as [string, number];
			})
	);

	return requester.reply(<RankingMessage ranking={rankingArray} />);
});

export const startPoopModule = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
				...total,
				...history,
				...ranking,
			},
		},
		name: 'poop',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
	return instance;
};
