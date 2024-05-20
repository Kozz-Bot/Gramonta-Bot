import { createMethod, createModule } from 'kozz-module-maker';
import { tagEveryone, tagMember } from 'kozz-module-maker/dist/InlineCommands';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import { useJsonDB } from 'src/Utils/StaticJsonDb';

const todesDb = useJsonDB('auth', 'src/Handlers/Todes/todesdb.json');

const getId = (requester: MessageObj) => {
	const groupId = requester.message.to;
	const contactId = requester.message.from;
	return `${groupId}/${contactId}`;
};

const tagAll = createMethod('fallback', requester => {
	const id = getId(requester);
	const entry = todesDb.getEntityById(id);

	if (!entry && !requester.message.fromHostAccount) {
		return requester.reply(
			'Você não tem autorização pra usar esse comando nesse grupo'
		);
	}

	const taggerId = requester.message.from;

	return requester.reply(
		`${tagMember(taggerId)} mencionou todos os membros: ${
			requester.rawCommand?.query
		} ${tagEveryone()}`
	);
});

const allow = createMethod(
	'allow',
	hostAccountOnly(requester => {
		const groupId = requester.message.to;
		const taggedMember = requester.message.taggedContacts[0]?.id;
		if (!taggedMember) {
			return requester.reply('Marque uma pessoa');
		}

		const id = `${groupId}/${taggedMember}`;
		const alreayEntry = todesDb.getEntityById(id);
		if (alreayEntry) {
			return requester.reply('Essa pessoa já está autorizada');
		}

		todesDb.addEntity({ id });
	})
);

const deny = createMethod(
	'deny',
	hostAccountOnly(requester => {
		const groupId = requester.message.to;
		const taggedMember = requester.message.taggedContacts[0]?.id;
		if (!taggedMember) {
			return requester.reply('Marque uma pessoa');
		}

		const id = `${groupId}/${taggedMember}`;
		const alreayEntry = todesDb.getEntityById(id);
		if (!alreayEntry) {
			return requester.reply('Essa pessoa não está autorizada');
		}

		todesDb.removeEntity(id);
	})
);

export const startTodesHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...tagAll,
				...allow,
				...deny,
			},
		},
		name: 'todes',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource(
		'help',
		() =>
			'Marca todos os membros do grupo. VOCÊ PRECISA DE AUTORIZAÇÃO PARA USAR ESSE COMANDO!'
	);

	return instance;
};
