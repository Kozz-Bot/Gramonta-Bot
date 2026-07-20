import { createModule, createMethod } from 'kozz-module-maker';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import * as CoinsApi from 'src/API/CoinsApi';
import { getFormattedDateAndTime } from 'src/Utils/date';
import {
	getCounterpart,
	getTransactionDirection,
	getTransactionType,
} from './CoinsHelper';
import {
	AddCoinsResponse,
	CreateAccountResponse,
	ErrorMessage,
	formatTransactionListItem,
	Help,
	Info,
	MakePremiumResponse,
} from './messages';

const assertUserExists = async (userId: string) => {
	const { userExists } = await CoinsApi.assertUserExists(userId);

	console.log({ userId });

	if (!userExists) {
		throw new Error('Esse usuário não possui conta no CalvoBank');
	}
};

const getInfo = createMethod('default', async requester => {
	try {
		const { id: userId } = requester.message.contact;

		await assertUserExists(userId);

		const { coins, premiumValidUntil, id } = await CoinsApi.getUserData(userId);
		const now = new Date().getTime();
		const premium = premiumValidUntil > now;

		requester.reply(
			<Info
				id={id}
				userId={userId}
				name={tagMember(userId)}
				coins={coins}
				premium={premium}
			/>
		);
	} catch (e) {
		return requester.reply(<ErrorMessage error={e} />);
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
			return requester.reply(<ErrorMessage error="Comando mal-formado." />);
		}

		if (!/^[0-9]+$/.test(amount)) {
			return requester.reply(<ErrorMessage error="Quantidade deve ser um número" />);
		}

		await assertUserExists(quotedUser);

		await CoinsApi.addCoinsToUser(quotedUser, Number(amount), requester.message);

		const { coins: userBalance } = await CoinsApi.getUserData(quotedUser);

		requester.reply(
			<AddCoinsResponse amount={amount} userBalance={userBalance} />
		);
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
				return requester.reply(<ErrorMessage error="Comando mal-formado." />);
			}

			const oneMonth = 1000 * 60 * 60 * 24 * 30; //in ms

			await assertUserExists(quotedUser);

			await CoinsApi.makeUserPremium(quotedUser, oneMonth, requester.message);

			requester.reply(<MakePremiumResponse quotedUser={tagMember(quotedUser)} />);
		} catch (e) {
			requester.reply(<ErrorMessage error={e} />);
		}
	}, 'Apenas o dono do bot pode fazer alguém premium')
);

const createAccount = createMethod('create', async requester => {
	try {
		const userId = requester.message.contact.id;

		await CoinsApi.createUser(userId);
		requester.reply(<CreateAccountResponse userId={userId} />);
	} catch (e) {
		requester.reply(<ErrorMessage error={e} />);
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

		const messages = formattedTransactionList.map(transaction =>
			formatTransactionListItem(transaction)
		);

		requester.reply(messages.join('\n___________________\n'));
	} catch (e) {
		return requester.reply(<ErrorMessage error={e} />);
	}
});

const help = createMethod('help', requester => requester.reply(<Help />));

export const startCoinsHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
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
	}).resources.upsertResource('help', () => <Help />);

	return instance;
};
