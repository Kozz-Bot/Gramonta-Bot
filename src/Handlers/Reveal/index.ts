import { createModule, createMethod } from 'kozz-handler-maker';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import { createAutoReveal } from 'src/Proxies/AutoReveal';
import { RevealMapProxy, createAutoRevealMap } from 'src/Proxies/AutoRevealMap';
import { useJsonDB } from 'src/StaticJsonDb';

const revealBlockDB = useJsonDB('block', './src/Handlers/Reveal/revealDB.json');
const RevealMapDB = useJsonDB<RevealMapProxy, 'map'>(
	'map',
	'./src/Handlers/Reveal/revealDB.json'
);

const defaultMethod = createMethod('default', requester => {
	if (revealBlockDB.getEntityById(requester.rawCommand.message.to)) {
		return requester.reply('Revelação de mídia desabilitada nesse grupo');
	}

	if (!requester.quotedMessage) {
		return requester.reply.withTemplate('Help');
	}

	if (!requester.quotedMessage.isViewOnce) {
		return requester.reply.withTemplate('error', {
			error: 'Apenas mensagens de visualização única podem ser reveladas',
		});
	}

	if (
		requester.quotedMessage.messageType === 'IMAGE' ||
		requester.quotedMessage.messageType === 'VIDEO'
	) {
		if (!requester.quotedMessage.media) {
			return requester.reply.withTemplate('error', {
				error: 'Erro: O bot não conseguiu encontrar mídia na mensagem',
			});
		}
		return requester.reply.withMedia(requester.quotedMessage.media);
	}
});

const autoReveal = createMethod(
	'auto',
	hostAccountOnly(requester => {
		requester.reply(
			'Revelando mídias de visualização única a partir de agora hehehe'
		);

		createAutoReveal(requester);
	})
);

const revealBlock = createMethod(
	'block',
	hostAccountOnly(requester => {
		const revealBlockDB = useJsonDB('block', './src/Handlers/Reveal/revealDB.json');
		revealBlockDB.addEntity({
			id: requester.rawCommand.message.to,
		});
		requester.reply('Revelação de mensagens desativada nesse grupo');
	})
);

const revealAllow = createMethod(
	'allow',
	hostAccountOnly(requester => {
		const revealBlockDB = useJsonDB('block', './src/Handlers/Reveal/revealDB.json');
		revealBlockDB.removeEntity(requester.rawCommand.message.to);
		requester.reply('Revelação de mensagens reativada nesse grupo');
	})
);

const templatePath = './src/Handlers/Reveal/reply.kozz.md';
export const startRevealHandler = () => {
	RevealMapDB.getAllEntities().forEach(proxy => {
		createAutoRevealMap(proxy);
	});

	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...defaultMethod,
				...autoReveal,
				...revealBlock,
				...revealAllow,
			},
		},
		name: 'reveal',
		address: `${process.env.GATEWAY_URL}`,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
};
