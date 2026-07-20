import { randomUUID } from 'crypto';
import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { MessageReceived } from 'kozz-types';
import { createChatCompletion } from 'src/API/MistralApi';
import { useJsonDB } from 'src/Utils/StaticJsonDb';
import {
	EmptySummary,
	Help,
	HostOnly,
	SilenceDisabled,
	SilenceEnabled,
	Summary,
	SummaryError,
} from './messages';

type SilencedChat = {
	id: string;
	chatName: string;
	silencedAt: number;
};

type SavedMention = {
	id: string;
	messageId: string;
	chatId: string;
	chatName: string;
	authorName: string;
	authorId: string;
	body: string;
	messageType: MessageReceived['messageType'];
	timestamp: number;
	reason: 'direct_mention' | 'reply';
};

const silencedChatsDB = useJsonDB<SilencedChat, 'chats'>(
	'chats',
	'./src/Handlers/Tags/silencedChats.json'
);

const mentionsDB = useJsonDB<SavedMention, 'mentions'>(
	'mentions',
	'./src/Handlers/Tags/mentions.json'
);

const getChatId = (message: MessageReceived) => message.chatId || message.to;

const getChatName = (message: MessageReceived) =>
	message.groupName || message.contact.publicName || getChatId(message);

const assertHost = (requester: MessageObj) => {
	if (!requester.message.fromHostAccount) {
		requester.reply(<HostOnly />);
		return false;
	}

	return true;
};

const isMentioningHost = (message: MessageReceived) => {
	if (message.fromHostAccount) {
		return {
			isMention: false,
			reason: null,
		};
	}

	const repliedToHost =
		message.quotedMessage?.fromHostAccount ||
		message.quotedMessage?.contact.isHostAccount;
	const taggedHost = message.taggedContacts.some(contact => contact.isHostAccount);

	return {
		isMention: !!repliedToHost || taggedHost,
		reason: taggedHost ? 'direct_mention' : repliedToHost ? 'reply' : null,
	} as {
		isMention: boolean;
		reason: SavedMention['reason'] | null;
	};
};

const getMessageBody = (message: MessageReceived) => {
	if (message.body) {
		return message.taggedConctactFriendlyBody || message.body;
	}

	if (message.media) {
		return `{Enviou uma mídia do tipo ${message.messageType}}`;
	}

	return `{Mensagem do tipo ${message.messageType}}`;
};

const formatMentionForLlm = (mention: SavedMention) => {
	const date = new Date(mention.timestamp).toLocaleString('pt-BR');
	const reason =
		mention.reason === 'direct_mention'
			? 'mencao direta'
			: 'resposta a uma mensagem sua';

	return [
		`Chat: ${mention.chatName} (${mention.chatId})`,
		`Data: ${date}`,
		`Autor: ${mention.authorName} (${mention.authorId})`,
		`Motivo: ${reason}`,
		`Mensagem: ${mention.body}`,
	].join('\n');
};

const summarizeMentions = async (mentions: SavedMention[]) => {
	const content = mentions
		.map((mention, index) => `#${index + 1}\n${formatMentionForLlm(mention)}`)
		.join('\n\n');

	const response = await createChatCompletion({
		temperature: 0.2,
		messages: [
			{
				role: 'system',
				content:
					'Você resume marcações recebidas em chats de WhatsApp. Escreva em português do Brasil, seja direto e destaque ações, perguntas e assuntos que precisam de resposta. Agrupe por chat quando fizer sentido. Não invente contexto.',
			},
			{
				role: 'user',
				content: `Resuma estas marcações silenciadas:\n\n${content}`,
			},
		],
	});

	return response.content ?? '';
};

const toggleSilence = createMethod('silence', requester => {
	if (!assertHost(requester)) {
		return;
	}

	const chatId = getChatId(requester.message);
	const existingChat = silencedChatsDB.getEntityById(chatId);

	if (existingChat) {
		silencedChatsDB.removeEntity(chatId);
		return requester.reply(<SilenceDisabled chatName={existingChat.chatName} />);
	}

	const chatName = getChatName(requester.message);
	silencedChatsDB.addEntity({
		id: chatId,
		chatName,
		silencedAt: Date.now(),
	});

	return requester.reply(<SilenceEnabled chatName={chatName} />);
});

const summary = createMethod('summary', async requester => {
	if (!assertHost(requester)) {
		return;
	}

	const mentions = mentionsDB.getAllEntities();
	if (!mentions.length) {
		return requester.reply(<EmptySummary />);
	}

	try {
		const content = await summarizeMentions(mentions);
		mentions.forEach(mention => mentionsDB.removeEntity(mention.id));
		return requester.reply(<Summary content={content} />);
	} catch (e) {
		console.warn('Failed to summarize silenced tags', e);
		return requester.reply(<SummaryError />);
	}
});

const help = createMethod('default', requester => {
	if (!assertHost(requester)) {
		return;
	}

	return requester.reply(<Help />);
});

const onMessage = async (requester: MessageObj) => {
	const { message } = requester;
	const chatId = getChatId(message);
	const silencedChat = silencedChatsDB.getEntityById(chatId);

	if (!silencedChat) {
		return;
	}

	const mentionStatus = isMentioningHost(message);
	if (!mentionStatus.isMention) {
		return;
	}

	mentionsDB.upsertEntity({
		id: randomUUID(),
		messageId: message.id,
		chatId,
		chatName: silencedChat.chatName,
		authorName: message.contact.publicName || message.from,
		authorId: message.from,
		body: getMessageBody(message),
		messageType: message.messageType,
		timestamp: message.timestamp ?? Date.now(),
		reason: mentionStatus.reason!,
	});

	try {
		await requester.ask.boundary(message.boundaryId, 'chat_read', {
			messageIds: [message.id],
		});
	} catch (e) {
		console.warn('Failed to mark silenced tag as read', e);
	}
};

export const startTagsHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...toggleSilence,
				...summary,
				...help,
			},
		},
		name: 'tags',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		proxy: {
			source: 'kozz-baileys/*',
			onMessage,
		},
	}).resources.upsertResource('help', () => <Help />);

	return instance;
};
