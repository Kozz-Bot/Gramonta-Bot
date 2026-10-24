import { createMethod, createModule } from 'kozz-module-maker';
import { createMessageObject, MessageObj } from 'kozz-module-maker/dist/Message';
import { MessageReceivedByGateway } from 'kozz-types';
import { createMuteSubscriptions } from './subscriptions';
import {
	claimMuteNotification, extendMute, getMuteRegister, hasActiveMuteInChat,
	isUserMutted, mutePerson, rememberMuteAliases, unmutePerson, MuteContact,
} from './mutedDB';
import { getMuteChat, resolveMuteContact } from './context';
import { Feedback, Help, MuteChanged, MutedNotice } from './messages';

type MuteArgs = { time?: number; reason?: string };
const changeMute = (action: 'mute' | 'unmute' | 'extend', syncProxies: () => void) => async (requester: MessageObj, args: MuteArgs) => {
	if (!requester.message.fromHostAccount) {
		return requester.reply(<Feedback text="Apenas o dono do bot pode usar esse comando." />);
	}
	const chat = getMuteChat(requester.message);
	if (!chat) return requester.reply(<Feedback text="Este comando só pode ser usado em grupos." />);
	const { boundaryName } = requester.message;
	if (!boundaryName || boundaryName === '*') return requester.reply(<Feedback text="Não foi possível identificar a conexão de origem deste comando." />);
	const contacts = requester.message.taggedContacts ?? [];
	if (!contacts.length) return requester.reply(<Feedback text="Marque o usuário que deseja silenciar, liberar ou ter o mute aumentado. Use !mute help para ver os parâmetros." />);
	const duration = (args.time ?? 5) * 60_000;
	if (action !== 'unmute' && (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(new Date(Date.now() + duration).getTime()))) {
		return requester.reply(<Feedback text="Informe um tempo válido, maior que zero, em minutos." />);
	}
	const handled = new Set<string>();
	for (const tagged of contacts) {
		try {
			const contact = await resolveMuteContact(requester, tagged);
			const ids = [contact.id, ...(contact.aliases ?? [])];
			if (ids.some(id => handled.has(id))) continue;
			ids.forEach(id => handled.add(id));
			const reason = args.reason?.trim();
			const mute = action === 'mute'
				? mutePerson(contact, chat, reason || 'Não informado', duration, boundaryName)
				: action === 'extend' ? extendMute(contact, chat, duration, reason, boundaryName) : undefined;
			if (action === 'unmute') unmutePerson(contact, chat);
			syncProxies();
			await requester.reply(<MuteChanged id={tagged.id} expiration={mute?.prettyExpiration} />);
		} catch (error) {
			await requester.reply(<Feedback text={error instanceof Error ? error.message : 'Não foi possível alterar o mute.'} />);
		}
	}
};

const onUserMessage = async (requester: MessageObj) => {
	const chat = getMuteChat(requester.message);
	if (!chat || !hasActiveMuteInChat(chat)) return;
	try {
		let contact: MuteContact = requester.message.contact;
		if (!isUserMutted(contact, chat)) {
			contact = await resolveMuteContact(requester, contact);
			rememberMuteAliases(contact);
		}
		if (!isUserMutted(contact, chat)) return;
		const mute = getMuteRegister(contact, chat)!;
		// Reserve before any send/await so concurrent messages cannot duplicate it.
		const notify = claimMuteNotification(contact, chat);
		try {
			if (notify) await requester.sendMessage(chat, <MutedNotice id={requester.message.from} expiration={mute.prettyExpiration} reason={mute.reason} />);
		} finally {
			await requester.message.delete();
		}
	} catch (error) {
		console.error('[Mute] Failed to moderate message:', error);
	}
};

export const startMuteHandler = () => {
	const syncProxies = () => subscriptions.sync();
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...createMethod('default', changeMute('mute', syncProxies), { reason: 'string?', time: 'number?' }),
				...createMethod('unmute', changeMute('unmute', syncProxies)),
				...createMethod('extend', changeMute('extend', syncProxies), { reason: 'string?', time: 'number?' }),
				...createMethod('help', requester => requester.reply(<Help />)),
			},
			aliases: [
				{ name: 'unmute', target: { method: 'unmute' } },
				{ name: 'mutemais', target: { method: 'extend' } },
			],
		},
		name: 'mute',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => <Help />);

	// A single listener handles every subscribed source. Each message retains
	// its own boundaryId for replies/resources and boundaryName for deletion.
	instance.socket.on('proxied_message', (message: MessageReceivedByGateway) =>
		onUserMessage(createMessageObject(instance.socket, message, 'mute'))
	);
	const subscriptions = createMuteSubscriptions(instance.socket);
	return instance;
};
