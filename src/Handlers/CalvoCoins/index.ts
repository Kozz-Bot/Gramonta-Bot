import { createModule, createMethod } from 'kozz-module-maker';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import * as CoinsApi from 'src/API/CoinsApi';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
import { getFormattedDateAndTime } from 'src/Utils/date';
import {
	getCounterpart,
	getTransactionDirection,
	getTransactionType,
} from './CoinsHelper';

const templatePath = './src/Handlers/CalvoCoins/messages.kozz.md';

const assertUserExists = async (userId: string) => {
	const { userExists } = await CoinsApi.assertUserExists(userId);

	if (!userExists) {
		throw new Error('Esse usuário não possui conta no CalvoBank');
	}
};

const getInfo = createMethod('default', async requester => {
	try {
		const { id: userId, publicName } = requester.message.contact;

		await assertUserExists(userId);

		const { coins, premiumValidUntil, id } = await CoinsApi.getUserData(userId);
		const now = new Date().getTime();
		const premium = premiumValidUntil > now;

		requester.reply.withTemplate('Info', {
			id: id,
			userId: userId,
			name: publicName,
			coins,
			premium: premium ? '✅' : '❌',
		});
	} catch (e) {
		return requester.reply.withTemplate('Error', {
			error: e,
		});
	}
});

const addCoins = createMethod(
	'add',
	hostAccountOnly(async requester => {
		const quotedUser =
			requester.message.quotedMessage?.from ||
			requester.message.taggedContacts[0].id;
		const amount = requester.rawCommand?.immediateArg;

		if (!quotedUser || !amount) {
			return requester.reply.withTemplate('Error', {
				error: 'Comando mal-formado.',
			});
		}

		if (!/^[0-9]+$/.test(amount)) {
			return requester.reply.withTemplate('Error', {
				error: 'Quantidade deve ser um número',
			});
		}

		await assertUserExists(quotedUser);

		await CoinsApi.addCoinsToUser(quotedUser, Number(amount), requester.message);

		const { coins: userBalance } = await CoinsApi.getUserData(quotedUser);

		requester.reply.withTemplate('AddCoinsResponse', {
			amount,
			userBalance,
		});
	}, 'Apenas o dono do bot pode adicionar moedas ao saldo de alguém')
);

const makePremium = createMethod(
	'premium',
	hostAccountOnly(async requester => {
		try {
			const quotedUser =
				requester.message.quotedMessage?.from ||
				requester.message.taggedContacts[0].id;

			if (!quotedUser) {
				return requester.reply.withTemplate('Error', {
					error: 'Comando mal-formado.',
				});
			}

			const oneMonth = 1000 * 60 * 60 * 24 * 30; //in ms

			await assertUserExists(quotedUser);

			await CoinsApi.makeUserPremium(quotedUser, oneMonth, requester.message);

			requester.reply.withTemplate('MakePremiumResponse', {
				quotedUser: quotedUser.split('@')[0],
			});
		} catch (e) {
			requester.reply.withTemplate('Error', {
				error: e,
			});
		}
	}, 'Apenas o dono do bot pode fazer alguém premium')
);

const createAccount = createMethod('create', async requester => {
	try {
		const userId = requester.message.contact.id;

		await CoinsApi.createUser(userId);
		requester.reply.withTemplate('CreateAccountResponse', {
			userId,
		});
	} catch (e) {
		requester.reply.withTemplate('Error', {
			error: e,
		});
	}
});

const getHistory = createMethod('history', async requester => {
	try {
		const userId = requester.message.contact.id;
		await assertUserExists(userId);

		const response = await CoinsApi.getFullTransactionList(userId);

		const formattedTransactionList = response.map(transaction => {
			const direction = getTransactionDirection(userId, transaction);
			const counterpart = getCounterpart(userId, transaction);
			const transactionType = getTransactionType(transaction);

			return {
				id: transaction.id,
				type: transactionType,
				amount: transaction.premiumSpending ? 0 : transaction.amount,
				direction: direction,
				counterpart: counterpart,
				timestamp: getFormattedDateAndTime(transaction.timestamp),
				messageBody: transaction.transactionRequestPayload.body,
				groupName: transaction.transactionRequestPayload.groupName ?? 'Chat Privado',
				mediaUrl: transaction.transactionRequestPayload.quotedMessage?.media
					? transaction.transactionRequestPayload.quotedMessage.media.data
					: 'Inexistente',
			};
		});

		const messages = await Promise.all(
			formattedTransactionList.map(transaction =>
				loadTemplates(templatePath).getTextFromTemplate(
					'TransactionListItem',
					transaction
				)
			)
		);

		requester.reply(messages.join('\n___________________\n'));
	} catch (e) {
		return requester.reply.withTemplate('Error', {
			error: e,
		});
	}
});

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
				...createAccount,
				...getHistory,
			},
		},
		name: 'coins',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
};
