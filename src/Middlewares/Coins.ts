import { MessageObj } from 'kozz-module-maker/dist/Message';
import { type Media, type MessageReceived } from 'kozz-types';
import * as CoinsApi from 'src/API/CoinsApi';
import { uploadMedia, uploadMediaFromMessage } from 'src/API/Firebase';

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
		try {
			const userId = requester.message.contact.id;
			const { userExists } = await CoinsApi.assertUserExists(userId);

			if (!userExists) {
				return requester.reply(
					'Você não possui conta no CalvoBank. Envie  `!coins create` para criar sua conta ou `!coins help` para mais informações'
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
				CoinsApi.spendCoins(
					userId,
					amount,
					await uploadAllMediaToBucket(requester.message)
				);
			}
		} catch (e) {
			console.warn(e);
			return requester.reply(`${e}`);
		}
	};

/**
 * Recursively traverses the quotedMessage map to upload to the bucket every
 * media and substitutes the media found for a url
 * @param message
 * @returns
 */
const uploadAllMediaToBucket = async (
	message: MessageReceived
): Promise<MessageReceived | undefined> => {
	const fileUrl = message.media ? await uploadMediaFromMessage(message) : undefined;

	return {
		...message,
		media: message.media
			? {
					...message.media,
					transportType: 'url',
					data: fileUrl!,
			  }
			: undefined,
		quotedMessage: message.quotedMessage
			? await uploadAllMediaToBucket(message.quotedMessage)
			: undefined,
	};
};

export const uploadMediaToBucket = async (
	name: string,
	media: Media
): Promise<string> => {
	return uploadMedia(name, media);
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
