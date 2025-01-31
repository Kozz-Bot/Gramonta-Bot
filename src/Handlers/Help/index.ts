import { createModule, createMethod } from 'kozz-module-maker';
import { promiseIsFulfilled } from 'src/Utils/promises';

const getHelp = createMethod('default', async requester => {
	const allHandlers = await requester.ask.gateway('all_modules');

	const allHelps = allHandlers.response.map((handler: any) => {
		return requester.ask.handler(handler.name, 'help').then(resp => ({
			name: handler.name,
			help: resp.response,
		}));
	}) as Promise<{
		name: string;
		help: string;
	}>[];

	Promise.allSettled(allHelps).then(allHelpTexts => {
		requester.reply(
			`________________\n\n` +
				allHelpTexts
					.filter(promiseIsFulfilled)
					.filter(data => !!data.value.help)
					.map(
						({ value }) => `*--- ${value.name.toUpperCase()} ----*\n${value.help}`
					)
					.join('\n________________\n\n')
		);
	});
});

export const startHelpInstance = () =>
	createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...getHelp,
			},
		},
		name: 'help',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
