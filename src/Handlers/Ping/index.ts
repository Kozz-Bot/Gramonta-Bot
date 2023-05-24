import { createHandlerInstance, createMethod } from 'kozz-handler-maker';

const defaultMethod = createMethod({
	name: 'default',
	args: {},
	func: requester => {
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
		name: 'ping',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
		},
		templatePath: './src/Handlers/Ping/reply.kozz.md',
	});
