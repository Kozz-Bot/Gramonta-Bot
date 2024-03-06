import { MessageObj } from 'kozz-module-maker/dist/Message';
import * as CoinsApi from 'src/API/CoinsApi';

/**
 * Make the callback return true or void to decrement the coins.
 * Returning _false_ in the callback will be considered as the
 * command has failed and no coins shall be deducted.
 * @param amount of coins that shall be deducted fora successfull command
 * @param callback - the command itself
 * @param errorMessage reply to the user if not enough coins are available
 * @returns
 */
export const usePremiumCommand =
	<ArgsType = any>(
		amount: number,
		callback: (
			requester: MessageObj,
			args: ArgsType
		) => boolean | void | Promise<boolean | void>,
		errorMessage: string
	) =>
	async (requester: MessageObj, args: ArgsType) => {
		const userId = requester.message.contact.id;
		const { userExists } = await CoinsApi.assertUserExists(userId);

		if (!userExists) {
			return requester.reply(
				'Você não possui conta no CalvoBank. Envie `!coins help` para mais informações'
			);
		}

		const { coins, premiumValidUntil } = await CoinsApi.getUserData(userId);

		const canUse = canUsePremiumCommand(amount, coins, premiumValidUntil);

		if (!canUse) {
			return requester.reply(
				`${errorMessage}\n - Você possui ${coins} CalvoCoins e o necessário são ${amount}`
			);
		}

		const shouldDeductCoins = await callback(requester, args);
		if (shouldDeductCoins === false) {
			return;
		} else {
			CoinsApi.spendCoins(userId, amount, requester.message);
		}
	};

const canUsePremiumCommand = (
	requestedAmount: number,
	userCoins: number,
	userPremiumValidDeadline: number
) => {
	const now = new Date().getTime();
	const premiumValid = userPremiumValidDeadline > now;

	return premiumValid || userCoins >= requestedAmount;
};
