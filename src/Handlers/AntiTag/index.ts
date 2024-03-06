import { createModule, createStateMachine } from 'kozz-module-maker';

export const createAntiTag = () => {
	createModule({
		name: 'anti-tag',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		proxy: {
			source: 'Gramonta-Wa/*',
			onMessage: createStateMachine({
				initialState: 'not-tagging',
				states: {
					['not-tagging']: {
						onMessage: ({ message }, stateMachine) => {
							if (message.fromHostAccount && message.santizedBody === '!antitag') {
								stateMachine.setState('anti-tag');
							}
						},
					},
					['anti-tag']: {
						onMessage: (requester, stateMachine) => {
							const respodingMyMessage =
								!!requester.message.quotedMessage?.contact.isHostAccount;
							const taggedMe = requester.message.taggedContacts.some(
								c => c.isHostAccount
							);
							const imTheAuthor = requester.message.contact.isHostAccount;
							const isGroup = requester.message.contact.isGroup;

							if (taggedMe || (!imTheAuthor && respodingMyMessage)) {
								requester.reply(
									'O anti-tag está ativo. Se precisar mesmo de uma resposta minha, favor me chamar no privado'
								);
							}

							if (
								requester.message.fromHostAccount &&
								requester.message.body === '!antitag cancel'
							) {
								stateMachine.setState('not-tagging');
							}
						},
						onStateEnable: requester => {
							requester.reply('Iniciando modo anti-tag');
						},
					},
				},
			}),
		},
	});
};
