import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import { addTransaction, getUser } from './CoinsHelper';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import { getFormattedDateAndTime } from 'src/Utils/date';
import { usePremiumCommand } from 'src/Middlewares/Coins';

const templatePath = './src/Handlers/CalvoCoins/messages.kozz.md';

const getInfo = createMethod({
	name: 'default',
	args: {},
	func: async (message, args) => {
		// Getting all relevant data
		const { id, publicName } = message.rawCommand.message.contact;
		const { coins, premium } = getUser(id);

		message.reply.withTemplate('Info', {
			name: publicName,
			coins,
			premium: premium ? 'Sim' : 'Não',
		});
	},
});

const addCoins = createMethod({
	name: 'add',
	args: {},
	func: hostAccountOnly(requester => {
		const quotedUser = requester.rawCommand.message.quotedMessage?.from;
		const amount = requester.rawCommand.immediateArg;

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
	}, 'Apenas o dono do bot pode adicionar moedas ao saldo de alguém'),
});

const makePremium = createMethod({
	name: 'premium',
	args: {},
	func: hostAccountOnly(requester => {
		const quotedUser = requester.rawCommand.message.quotedMessage?.from;
		if (!quotedUser) return;

		addTransaction(quotedUser, {
			amountBought: 0,
			buyingPremium: true,
			date: new Date().getTime(),
			formattedDate: getFormattedDateAndTime(),
			id: new Date().getTime(),
		});

		requester.reply('Feito :)');
	}, 'Apenas o dono do bot pode fazer alguém premium'),
});

const spend = createMethod({
	name: 'spend',
	args: {},
	func: usePremiumCommand(
		3,
		requester => {
			requester.reply('Você gastou 3 moedas');
		},
		'Você não possui moedas suficientes'
	),
});

export const startCoinsHandler = () => {
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],

		name: 'coins',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...getInfo,
			...addCoins,
			...makePremium,
			...spend,
		},
		templatePath,
	});
};
