import axios from 'axios';
import { type MessageReceivedByGateway } from 'kozz-types';

export type CoinsEntitiesModel = {
	user: {
		userId: string;
		coins: number;
		lastPremiumBought: number;
		premiumValidUntil: number;
		transactionHistory: string[];
	};
	transaction: {
		transactionRequestPayload: MessageReceivedByGateway;
		transactionOrigin: string;
		amount: number;
		from: string;
		to: string;
		premium: boolean;
		premiumValidUntil?: number;
		premiumSpending: boolean;
		timestamp: number;
	};
};

export type EntityTypes = keyof CoinsEntitiesModel;

export type WithID<T extends keyof CoinsEntitiesModel> = {
	id: string;
} & CoinsEntitiesModel[T];

const instance = axios.create({
	baseURL: 'http://192.168.15.4:8000/coins/',
	headers: {
		Authorization: `${process.env.COINS_TOKEN}`,
	},
});

export const getUserData = async (userId: string) => {
	const response = await instance.get<WithID<'user'>>('/user', {
		params: {
			userId: userId.replace('@s.whatsapp.net', '@c.us'),
		},
	});

	return response.data;
};

export const addCoinsToUser = async (
	userId: string,
	amount: number,
	payload: any
) => {
	const response = await instance.post('/user/add-balance', {
		userId: userId.replace('@s.whatsapp.net', '@c.us'),
		amount,
		payload,
	});

	return response.data;
};

export const makeUserPremium = async (
	userId: string,
	premiumValidFor: number,
	payload: any
) => {
	const response = await instance.post('/user/set-premium', {
		userId: userId.replace('@s.whatsapp.net', '@c.us'),
		premiumValidFor,
		payload,
	});

	return response.data;
};

export const spendCoins = async (userId: string, amount: number, payload: any) => {
	const response = await instance.post('/user/spend', {
		userId: userId.replace('@s.whatsapp.net', '@c.us'),
		amount,
		payload,
	});

	return response.data;
};

export const createUser = async (userId: string, coins = 0) => {
	const response = await instance.post('/user', {
		userId: userId.replace('@s.whatsapp.net', '@c.us'),
		coins,
	});

	return response.data;
};

export const getFullTransactionList = async (userId: string) => {
	const response = await instance.get<WithID<'transaction'>[]>(
		'/transactions/list',
		{
			params: {
				userId: userId.replace('@s.whatsapp.net', '@c.us'),
			},
		}
	);

	return response.data;
};

type AssertUserExistsResponse = {
	success: boolean;
	userExists: boolean;
};
export const assertUserExists = async (userId: string) => {
	const response = await instance.get<AssertUserExistsResponse>('/user/exists', {
		params: {
			userId: userId.replace('@s.whatsapp.net', '@c.us'),
		},
	});

	return response.data;
};
