import { createMethod, createModule } from 'kozz-module-maker';
import { registerPlayer } from 'src/API/MineRegister';

const register = createMethod('register', async requester => {
	const username = requester.rawCommand?.immediateArg;
	if (!username) {
		return requester.reply(
			'Por favor forneça seu username. Exemplo: `!mine steve156`'
		);
	}

	const actualUsername = requester.message.body.split(' ')[2];
	console.log(username, actualUsername);

	const { message, success } = await registerPlayer(actualUsername);

	return requester.reply(`${success ? 'Sucesso!' : 'Erro:'} ${message}`);
});

export const startMineHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...register,
			},
		},
		name: 'mine',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});

	return instance;
};
