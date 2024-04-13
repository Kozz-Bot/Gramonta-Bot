import { MessageObj } from 'kozz-module-maker/dist/Message';

type Use = {
	command: string;
	useAgain: number;
};

type LastUsed = Record<string, Use>;

let lastUsed: LastUsed = {};

export const rateLimit =
	<ArgsType = any>(
		timeInMs: number,
		command: string,
		callback: (
			requester: MessageObj,
			args: ArgsType
		) => boolean | void | Promise<boolean | void>,
		errorMessage: string = 'Esse comando está sendo usado em excesso. Tente novamente mais tarde e com moderação.'
	) =>
	async (requester: MessageObj, args: ArgsType) => {
		const now = new Date().getTime();
		const personId = requester.message.from;

		const chatNextUse = lastUsed[personId];

		if (chatNextUse && chatNextUse.useAgain > now) {
			return requester.reply(errorMessage);
		}

		lastUsed[personId] = {
			command,
			useAgain: now + timeInMs,
		};
		return callback(requester, args);
	};
