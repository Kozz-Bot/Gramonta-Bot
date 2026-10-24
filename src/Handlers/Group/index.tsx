import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import {
	disableCommandsForGroup,
	enableCommandsForGroup,
} from './groupState';
import { CommandsDisabled, CommandsEnabled, GroupOnly, Help, HostOnly } from './messages';

const getGroupId = (requester: MessageObj) => {
	const { chatId, to } = requester.message;

	if (chatId?.endsWith('@g.us')) {
		return chatId;
	}

	if (to.endsWith('@g.us')) {
		return to;
	}

	return null;
};

const canChangeGroupSettings = (requester: MessageObj) => {
	if (!requester.message.fromHostAccount) {
		requester.reply(<HostOnly />);
		return false;
	}

	return true;
};

const disable = createMethod('off', requester => {
	if (!canChangeGroupSettings(requester)) return;

	const groupId = getGroupId(requester);
	if (!groupId) {
		return requester.reply(<GroupOnly />);
	}

	disableCommandsForGroup(groupId);
	return requester.reply(<CommandsDisabled />);
});

const enable = createMethod('on', requester => {
	if (!canChangeGroupSettings(requester)) return;

	const groupId = getGroupId(requester);
	if (!groupId) {
		return requester.reply(<GroupOnly />);
	}

	enableCommandsForGroup(groupId);
	return requester.reply(<CommandsEnabled />);
});

const help = createMethod('default', requester => requester.reply(<Help />));

export const startGroupHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...disable,
				...enable,
				...help,
			},
		},
		name: 'group',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => <Help />);
