import { UseFn } from 'kozz-handler-maker';
import { MessageObj } from 'kozz-handler-maker/dist/Message';
import { Command } from 'kozz-types';
import { useJsonDB } from 'src/StaticJsonDb';
import { getFormattedDateAndTime } from 'src/Utils/date';

type Transaction = {
	id: number;
	date: number;
	formattedDate: string;
	amountBought: number;
	buyingPremium: boolean;
};

type MessagelessCommand = {
	[key in keyof Command as Exclude<key, 'message'>]: Command[key];
};

type CoinUsed = {
	id: string;
	date: number;
	formattedDate: string;
	amountUsed: number;
	commandPayload: MessagelessCommand;
	messageData: {
		chatId: string;
		messageId: string;
		messageBody: string;
	};
};

type UserCoins = {
	id: string;
	coins: number;
	premium: boolean;
	lastPremiumBought?: number;
	transactionHistory: Transaction[];
	coinsUsedHistory: CoinUsed[];
};

const userCoinsDB = useJsonDB<UserCoins, 'diamonds'>(
	'diamonds',
	'./src/Handlers/CalvoCoins/diamonds.json'
);

export default userCoinsDB;

export const getUser = (id: string) => {
	if (!userCoinsDB.getEntityById(id)) {
		userCoinsDB.addEntity({
			id,
			coins: 0,
			premium: false,
			transactionHistory: [],
			coinsUsedHistory: [],
		});
	}

	return userCoinsDB.getEntityById(id)!;
};

export const addTransaction = (id: string, transaction: Transaction) => {
	const user = structuredClone(getUser(id));

	if (transaction.amountBought > 0) {
		user.coins += transaction.amountBought;
	}

	if (transaction.buyingPremium) {
		user.premium = true;
		user.lastPremiumBought = new Date().getTime();
	}

	user.transactionHistory.push(transaction);
	userCoinsDB.updateEntity(id, user);
};

export const spendCoins = (user: UserCoins, command: Command, amount = 1) => {
	const myUser = structuredClone(user);

	const coinsUsed: CoinUsed = {
		amountUsed: user.premium ? 0 : amount,
		commandPayload: command,
		date: new Date().getTime(),
		formattedDate: getFormattedDateAndTime(),
		id: command.message.id,
		messageData: {
			chatId: command.message.to,
			messageId: command.message.id,
			messageBody: command.message.body,
		},
	};

	myUser.coinsUsedHistory.push(coinsUsed);

	if (!user.premium) {
		myUser.coins -= amount;
	}

	userCoinsDB.updateEntity(user.id, myUser);
};

export const removePremium = (user: UserCoins) => {
	userCoinsDB.updateEntity(user.id, {
		premium: false,
	});

	addTransaction(user.id, {
		amountBought: 0,
		buyingPremium: false,
		date: new Date().getTime(),
		formattedDate: getFormattedDateAndTime(),
		id: new Date().getTime(),
	});
};

export const isPremium = (user: UserCoins) => {
	const isPremiumValid = (premiumLastBough: number) => {
		const oneMonth = 2.592e9;
		return premiumLastBough + oneMonth > new Date().getTime();
	};

	return user.premium && isPremiumValid(user.lastPremiumBought!);
};

export const haveCoins = (user: UserCoins, amount = 1) => {
	return user.coins >= amount;
};

export const canUsePremiumCommand = (user: UserCoins, amount = 1) => {
	return isPremium(user) || haveCoins(user, amount);
};
