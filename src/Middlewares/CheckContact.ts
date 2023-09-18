import { MessageObj } from 'kozz-module-maker/dist/Message';

export const hostAccountOnly =
	<T>(
		callback: (requester: MessageObj, args: T) => any,
		errorMessage: string = 'Apenas o dono do bot pode usar esse comando'
	) =>
	(requester: MessageObj, args: T) => {
		if (!requester.rawCommand.message.fromHostAccount) {
			requester.reply(errorMessage);
		} else {
			callback(requester, args);
		}
	};
