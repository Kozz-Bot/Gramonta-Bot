import { MessageObj } from 'kozz-module-maker/dist/Message';

export const hostAccountOnly =
	<T>(
		callback: (requester: MessageObj, args: T) => any,
		errorMessage: string = 'Apenas o dono do bot pode usar esse comando'
	) =>
	(requester: MessageObj, args: T) => {
		if (!requester.rawCommand!.message.fromHostAccount) {
			return requester.reply(errorMessage);
		} else {
			return callback(requester, args);
		}
	};
