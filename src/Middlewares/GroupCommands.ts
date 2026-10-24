import { UseFn } from 'kozz-module-maker/dist/Instance/Common';
import { areCommandsDisabledForGroup } from 'src/Handlers/Group/groupState';

const getGroupId = (command: Parameters<UseFn>[0]) => {
	const { chatId, to } = command.message;

	if (chatId?.endsWith('@g.us')) {
		return chatId;
	}

	if (to.endsWith('@g.us')) {
		return to;
	}

	return null;
};

const isGroupEnableCommand = (command: Parameters<UseFn>[0]) =>
	(command.module || '').toLowerCase() === 'group' &&
	command.method.toLowerCase() === 'on';

export const useGroupCommands: UseFn = command => {
	const groupId = getGroupId(command);
	if (!groupId || isGroupEnableCommand(command)) {
		return command;
	}

	if (areCommandsDisabledForGroup(groupId)) {
		command.namedArgs ??= {};
		command.namedArgs.abort = true;
	}

	return command;
};
