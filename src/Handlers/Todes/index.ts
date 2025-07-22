import { createMethod, createModule } from 'kozz-module-maker';

const fallback = createMethod('fallback', requester => {
	requester.reply('Comando movido, agora se chama !all');
});

export const startTodesHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...fallback,
			},
		},
		name: 'todes',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
	return instance;
};
