import { WithID } from 'src/API/CoinsApi';

export const getTransactionType = (transaction: WithID<'transaction'>) => {
	if (transaction.premium) {
		return 'Compra de Premium';
	}

	if (transaction.from === 'MASTER') {
		return 'Compra de moedas';
	}

	if (transaction.to === 'MASTER') {
		return 'Comprar comando';
	}

	return 'Transferência de moedas';
};

export const maybeMaster = (userId: string) =>
	userId === 'MASTER' ? 'Kozz-Bot' : userId;

export const getCounterpart = (
	userId: string,
	transaction: WithID<'transaction'>
) => {
	return transaction.from === userId
		? maybeMaster(transaction.to)
		: maybeMaster(transaction.from);
};

export const getTransactionDirection = (
	userId: string,
	transaction: WithID<'transaction'>
) => {
	return transaction.from === userId ? 'Saída' : 'Entrada';
};
