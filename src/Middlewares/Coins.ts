import { MessageObj } from 'kozz-module-maker/dist/Message';
import {
	getUser,
	canUsePremiumCommand,
	spendCoins,
} from 'src/Handlers/CalvoCoins/CoinsHelper';

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
		const user = getUser(requester.rawCommand.message.contact.id);
		const canUse = canUsePremiumCommand(user);

		if (!canUse) {
			return requester.reply(
				`${errorMessage}\n - Você possui ${user.coins} CalvoCoins e o necessário são ${amount}`
			);
		}

		const shouldDeductCoins = await callback(requester, args);
		if (shouldDeductCoins === false) {
			return;
		} else {
			spendCoins(user, requester.rawCommand, amount);
		}
	};
