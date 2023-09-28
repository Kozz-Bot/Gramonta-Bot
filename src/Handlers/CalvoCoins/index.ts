import { createModule, createMethod } from 'kozz-module-maker';
import userCoinsDB, { addTransaction, getUser } from './CoinsHelper';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import { getFormattedDateAndTime } from 'src/Utils/date';
import { usePremiumCommand } from 'src/Middlewares/Coins';
import { loadTemplates } from 'kozz-module-maker/dist/Message';

const templatePath = './src/Handlers/CalvoCoins/messages.kozz.md';

const getInfo = createMethod('default', requester => {
	// Getting all relevant data
	const { id, publicName } = requester.message.contact;
	const { coins, premium } = getUser(id);

	requester.reply.withTemplate('Info', {
		name: publicName,
		coins,
		premium: premium ? 'Sim' : 'Não',
	});
});

const addCoins = createMethod(
	'add',
	hostAccountOnly(requester => {
		const quotedUser = requester.message.quotedMessage?.from;
		const amount = requester.rawCommand?.immediateArg;

		if (!quotedUser) return;
		if (!amount) return;

		addTransaction(quotedUser, {
			amountBought: Number(amount),
			buyingPremium: false,
			date: new Date().getTime(),
			formattedDate: getFormattedDateAndTime(),
			id: new Date().getTime(),
		});

		requester.reply('Feito :)');
	}, 'Apenas o dono do bot pode adicionar moedas ao saldo de alguém')
);

const makePremium = createMethod(
	'premium',
	hostAccountOnly(requester => {
		const quotedUser = requester.message.quotedMessage?.from;
		if (!quotedUser) return;

		addTransaction(quotedUser, {
			amountBought: 0,
			buyingPremium: true,
			date: new Date().getTime(),
			formattedDate: getFormattedDateAndTime(),
			id: new Date().getTime(),
		});

		requester.reply('Feito :)');
	}, 'Apenas o dono do bot pode fazer alguém premium')
);

const help = createMethod('help', requester => requester.reply.withTemplate('Help'));

export const startCoinsHandler = () => {
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...getInfo,
				...addCoins,
				...makePremium,
				...help,
			},
		},
		name: 'coins',
		address: `${process.env.GATEWAY_URL}`,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
};
