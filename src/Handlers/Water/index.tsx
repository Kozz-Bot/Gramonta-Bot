import { createMethod, createModule } from 'kozz-module-maker';
import { useJsonDB } from 'src/Utils/StaticJsonDb';
import { randomUUID } from 'crypto';
import { ContactPayload } from 'kozz-types';
import {
	AddWater,
	History,
	InvalidUnit,
	NoHistory,
	NoWaterAmount,
	RankingMessage,
	Total,
} from './messages';

const __WATER_GROUP_ID__ = '120363420040249939@g.us';

export type Water = {
	id: string;
	contactId: string;
	timestamp: number;
	amount: number;
};

const waterDb = useJsonDB<Water, 'water'>(
	'water',
	'./src/Handlers/Water/waterDB.json'
);

const defaultMethod = createMethod('fallback', requester => {
	if (requester.message.chatId !== __WATER_GROUP_ID__) {
		return;
	}

	const parseableAmount = requester.rawCommand!.query;
	if (!parseableAmount) {
		return requester.reply(<NoWaterAmount />);
	}

	let amount = parseFloat(
		parseableAmount
			.replace(',', '.')
			.replace(/[^\d.]/g, '')
			.trim()
	);
	const unit = parseableAmount
		.replace(/[\d.,\s]/g, '')
		.toLowerCase()
		.trim();

	if (unit !== 'ml' && unit !== 'l') {
		return requester.reply(<InvalidUnit unit={unit} />);
	}

	if (unit === 'l') {
		amount = amount * 1000;
	}

	waterDb.addEntity({
		id: randomUUID(),
		contactId: requester.message.contact.id,
		timestamp: new Date().getTime(),
		amount,
	});

	return requester.reply(<AddWater amount={amount} />);
});

const total = createMethod('total', requester => {
	if (requester.message.chatId !== __WATER_GROUP_ID__) {
		return;
	}

	const drinks = waterDb
		.getAllEntities()
		.filter(drink => drink.contactId === requester.message.contact.id)
		.reduce((acc, drink) => acc + drink.amount, 0);
	if (drinks === 0) {
		return requester.reply(
			<NoHistory name={requester.message.contact.publicName} />
		);
	}

	return requester.reply(<Total total={drinks} />);
});

const history = createMethod('history', requester => {
	if (requester.message.chatId !== __WATER_GROUP_ID__) {
		return;
	}

	const drinks = waterDb
		.getAllEntities()
		.filter(poop => poop.contactId === requester.message.contact.id);

	if (drinks.length === 0) {
		return requester.reply(
			<NoHistory name={requester.message.contact.publicName} />
		);
	}

	return requester.reply(
		<History drinks={drinks} name={requester.message.contact.publicName} />
	);
});

const ranking = createMethod('ranking', async requester => {
	if (requester.message.chatId !== __WATER_GROUP_ID__) {
		return;
	}

	const ranking: Record<string, number> = {};

	waterDb.getAllEntities().forEach(drink => {
		ranking[drink.contactId] = ranking[drink.contactId]
			? ranking[drink.contactId] + drink.amount
			: drink.amount;
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

export const startWaterModule = () => {
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
		name: 'water',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
	return instance;
};
