import { createHandlerInstance, createMethod } from 'kozz-handler-maker';

const defaultMethod = createMethod({
	name: 'default',
	args: {},
	func: requester => {
		if (requester.rawCommand.message.contact.id === '558892440605@c.us') {
			return;
		}

		const now = new Date().getTime();
		const requestTime = requester.rawCommand.message.timestamp;
		const difference = (now - requestTime) / 1000;

		requester.reply.withTemplate('pong', {
			difference,
		});
	},
});

export const startPingHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 'ping',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
		},
		templatePath: './src/Handlers/Ping/reply.kozz.md',
	});
