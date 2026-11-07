import { createModule } from 'kozz-module-maker';
import type {
	ContactPayload,
	GroupChat,
	ForwardableUserJoinedGroup,
	ForwardableUserLeftGroup,
} from 'kozz-types';
import { groupMembershipMessages } from './messages';

export const startGroupMembershipService = () => {
	const module = createModule({
		name: 'group-membership',
		namespace: 'default',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});

	const send = async (
		chatId: string,
		members: ContactPayload[],
		action: 'join' | 'leave'
	) => {
		const template = groupMembershipMessages[chatId]?.[action];
		if (!template) return;
		const { response: group } = await module.ask.boundary(
			'kozz-zapo',
			'group_chat_info',
			{ chatId }
		);
		if (!group) return;
		for (const member of members)
			module.sendMessage(
				chatId,
				'kozz-zapo',
				template({ group: group as GroupChat, member })
			);
	};
	module.on(
		'user_joined_group',
		'kozz-zapo',
		(event: ForwardableUserJoinedGroup) => {
			void send(event.chatId, event.membersAdded, 'join').catch(() =>
				console.warn('[GroupMembership] Falha na mensagem de entrada.')
			);
		}
	);
	const onLeave = (event: ForwardableUserLeftGroup) => {
		void send(event.chatId, [event.contact], 'leave').catch(() =>
			console.warn('[GroupMembership] Falha na mensagem de saída.')
		);
	};
	module.on('user_left_group', 'kozz-zapo', onLeave);
	module.on('user_kicked_from_group', 'kozz-zapo', onLeave);
	module.on('user_removed_from_group', 'kozz-zapo', onLeave);
	return module;
};
