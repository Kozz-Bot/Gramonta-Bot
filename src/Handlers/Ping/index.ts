import { createModule, createMethod } from 'kozz-handler-maker';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';

const defaultMethod = createMethod('default', requester => {
	const now = new Date().getTime();
	const requestTime = requester.rawCommand.message.timestamp;
	const difference = (now - requestTime!) / 1000;

	requester.reply.withTemplate('pong', {
		difference,
	});
});

const templatePath = './src/Handlers/Ping/reply.kozz.md';

export const startPingHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...defaultMethod,
			},
		},
		name: 'ping',
		address: `${process.env.GATEWAY_URL}`,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
