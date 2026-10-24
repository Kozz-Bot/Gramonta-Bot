import { createMethod, createModule } from 'kozz-module-maker';
import { rateLimit } from 'src/Middlewares/RateLimit';
import { Help, Menu } from './messages';

const menu = createMethod('default', rateLimit(3000, 'botoes', requester => {
	requester.reply.withButtons(<Menu />, {
		buttons: [
			{ id: 'ping', label: 'Testar ping', command: '!ping' },
			{ id: 'help', label: 'Ajuda dos botões', command: '!botoes ajuda' },
		],
		footer: 'Kozz',
	});
}));

export const startButtonsHandler = () => createModule({
	name: 'botoes',
	address: `${process.env.GATEWAY_URL}`,
	customSocketPath: process.env.SOCKET_PATH,
	commands: { boundariesToHandle: ['*'], methods: {
		...menu,
		...createMethod('ajuda', requester => requester.reply(<Help />)),
	} },
}).resources.upsertResource('help', () => <Help />);
