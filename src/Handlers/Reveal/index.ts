import { createModule, createMethod } from 'kozz-module-maker';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import { createAutoReveal } from 'src/Proxies/AutoReveal';
import { RevealMapProxy, createAutoRevealMap } from 'src/Proxies/AutoRevealMap';
import { useJsonDB } from 'src/Utils/StaticJsonDb';
import { ErrorMessage, Help } from './messages';

const revealBlockDB = useJsonDB('block', './src/Handlers/Reveal/revealDB.json');
const RevealMapDB = useJsonDB<RevealMapProxy, 'map'>(
	'map',
	'./src/Handlers/Reveal/revealDB.json'
);

const defaultMethod = createMethod('default', requester => {
	const { quotedMessage } = requester.message;

	if (revealBlockDB.getEntityById(requester.message.to)) {
		return requester.reply('Revelação de mídia desabilitada nesse grupo');
	}

	if (!quotedMessage) {
		return requester.reply(Help());
	}

	if (!quotedMessage.isViewOnce) {
		return requester.reply(
			ErrorMessage({
				error: 'Apenas mensagens de visualização única podem ser reveladas',
			})
		);
	}

	if (!quotedMessage.media) {
		return requester.reply(
			ErrorMessage({
				error: 'Erro: O bot não conseguiu encontrar mídia na mensagem',
			})
		);
	}

	return requester.reply.withMedia(quotedMessage.media);
});

const autoReveal = createMethod(
	'auto',
	hostAccountOnly(requester => {
		requester.reply(
			'Revelando mídias de visualização única a partir de agora hehehe'
		);

		createAutoReveal(requester);

		RevealMapDB.addEntity({
			id: requester.message.id,
			from: requester.message.to,
			to: requester.message.to,
			boundaryId: requester.message.boundaryName,
		});
	})
);

const revealBlock = createMethod(
	'block',
	hostAccountOnly(requester => {
		const revealBlockDB = useJsonDB('block', './src/Handlers/Reveal/revealDB.json');
		revealBlockDB.addEntity({
			id: requester.message.to,
		});
		requester.reply('Revelação de mensagens desativada nesse grupo');
	})
);

const revealAllow = createMethod(
	'allow',
	hostAccountOnly(requester => {
		const revealBlockDB = useJsonDB('block', './src/Handlers/Reveal/revealDB.json');
		revealBlockDB.removeEntity(requester.message.to);
		requester.reply('Revelação de mensagens reativada nesse grupo');
	})
);

export const startRevealHandler = () => {
	RevealMapDB.getAllEntities().forEach(proxy => {
		createAutoRevealMap(proxy);
	});

	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
				...autoReveal,
				...revealBlock,
				...revealAllow,
			},
		},
		name: 'reveal',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => Help());

	return instance;
};
