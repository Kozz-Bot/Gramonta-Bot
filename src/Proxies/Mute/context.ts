import { MessageObj } from 'kozz-module-maker/dist/Message';
import { MuteContact } from './mutedDB';

export const getMuteChat = (message: { chatId?: string; to: string }) => {
	if (message.chatId?.endsWith('@g.us')) return message.chatId;
	return message.to?.endsWith('@g.us') ? message.to : null;
};

export const resolveMuteContact = async (requester: Pick<MessageObj, 'ask' | 'message'>, contact: MuteContact): Promise<MuteContact> => {
	const isLid = contact.id.endsWith('@lid');
	if (!isLid && !contact.id.endsWith('@s.whatsapp.net')) return contact;
	const result = await requester.ask.boundary(
		requester.message.boundaryId,
		isLid ? 'jid_from_lid' : 'lid_from_jid',
		{ id: contact.id }
	);
	const response = result?.response as { jid?: string; lid?: string } | undefined;
	const alias = isLid ? response?.jid : response?.lid;
	return { ...contact, aliases: [...(contact.aliases ?? []), ...(alias ? [alias] : [])] };
};
