import { createMethod, createModule } from 'kozz-module-maker';

const TARGET_JID = '5511975612526@s.whatsapp.net';

const defaultMethod = createMethod('default', requester => {
	requester.sendMessage(TARGET_JID, 'oi');
	requester.reply(`Enviei "oi" para ${TARGET_JID}.`);
});

export const startTestHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
			},
		},
		name: 'test',
		customSocketPath: process.env.SOCKET_PATH,
		address: `${process.env.GATEWAY_URL}`,
	});
