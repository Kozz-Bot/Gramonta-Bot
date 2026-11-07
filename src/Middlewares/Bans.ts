import type { UseFn } from 'kozz-module-maker/dist/Instance/Common';
import { botBans } from '../Services/Bans/store';

export const useBans: UseFn = command => {
	const { contact, from } = command.message;
	const aliases = (contact as { aliases?: string[] }).aliases ?? [];
	if (botBans.isBanned([contact.id, ...aliases, from])) {
		command.namedArgs ??= {};
		command.namedArgs.abort = true;
	}
	return command;
};
