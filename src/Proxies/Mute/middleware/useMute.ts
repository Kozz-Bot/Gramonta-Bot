import { UseFn } from 'kozz-module-maker/dist/Instance/Common';
import { isUserMutted } from '../mutedDB';
import { getMuteChat } from '../context';

export const useMute: UseFn = command => {
	const chat = getMuteChat(command.message);
	// The host must be able to revoke a mute, including their own.
	if (command.message.fromHostAccount && command.module === 'mute') return command;
	if (chat && isUserMutted(command.message.contact, chat)) {
		command.namedArgs ??= {};
		command.namedArgs.abort = true;
	}
	return command;
};
