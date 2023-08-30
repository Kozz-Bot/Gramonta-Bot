import { MessageObj } from 'kozz-handler-maker/dist/Message';

export const hostAccountOnly =
	<T>(callback: (requester: MessageObj, args: T) => any, errorMessage: string) =>
	(requester: MessageObj, args: T) => {
		if (!requester.rawCommand.message.fromHostAccount) {
			requester.reply(errorMessage);
		} else {
			callback(requester, args);
		}
	};
