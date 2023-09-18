import { createModule, createMethod } from 'kozz-module-maker';

const getHelp = createMethod('default', async requester => {
	const allHandlers = await requester.ask.gateway('all_handlers');

	const allHelps = allHandlers.response.map((handler: any) => {
		return requester.ask.handler(handler.name, 'help').then(resp => ({
			name: handler.name,
			help: resp.response,
		}));
	}) as Promise<{
		name: string;
		help: string;
	}>[];

	Promise.all(allHelps).then(allHelpTexts => {
		requester.reply(
			`________________\n\n` +
				allHelpTexts
					.filter(text => !!text.help)
					.map(text => `*--- ${text.name.toUpperCase()} ----*\n${text.help}`)
					.join('\n________________\n\n')
		);
	});
});

export const startHelpInstance = () =>
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...getHelp,
			},
		},
		name: 'help',
		address: `${process.env.GATEWAY_URL}`,
	});
