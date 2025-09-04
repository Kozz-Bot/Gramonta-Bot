import { UseFn } from 'kozz-module-maker/dist/Instance/Common';
import { isUserMutted } from '../mutedDB';

export const useMute: UseFn = command => {
	const { contact, to: chat } = command.message;
	if (isUserMutted(contact, chat)) {
		if (!command.namedArgs) {
			command.namedArgs = {};
		}
		command.namedArgs.abort = true;
	}

	return command;
};
