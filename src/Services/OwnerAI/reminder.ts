import type { MessageObj } from 'kozz-module-maker/dist/Message';
import type { ContactPayload, GroupChat } from 'kozz-types';
import {
	contactId,
	isPersonId,
	parseDuration,
	parseReminder,
} from '../../Handlers/Lembrete/store';
import { AiToolInputError } from './contracts';
import { ownerBoundary } from './control';

export const prepareReminderInput = async (
	r: MessageObj,
	args: Record<string, unknown>,
	chatId: string
) => {
	if (
		typeof args.duration !== 'string' ||
		args.duration.length > 80 ||
		typeof args.text !== 'string' ||
		!args.text.trim() ||
		args.text.length > 2000 ||
		/(?:^|\s)--/.test(args.text) ||
		typeof args.private !== 'boolean' ||
		!Array.isArray(args.recipientIds) ||
		args.recipientIds.length > 20 ||
		args.recipientIds.some(id => !isPersonId(id))
	)
		throw new AiToolInputError(
			'Informe duration (ex.: 1m), text, recipientIds (IDs reais ou [] para o criador) e private (booleano). Não coloque flags dentro do texto.'
		);
	try {
		parseDuration(args.duration);
	} catch (error) {
		throw new AiToolInputError((error as Error).message);
	}
	const ids = [...new Set(args.recipientIds as string[])];
	if ((ids.length || args.private) && !chatId.endsWith('@g.us'))
		throw new AiToolInputError(
			'Pessoas da lista e avisos adicionais no privado exigem um grupo como destino.'
		);
	const contacts: ContactPayload[] = [];
	const aliases: string[][] = [];
	for (const id of ids) {
		const found = await ownerBoundary(r, 'search', { query: id, kind: 'contact' });
		const person = found.matches?.find(
			(item: any) =>
				item.kind !== 'group' && (item.id === id || item.aliases?.includes(id))
		);
		if (!person || !isPersonId(person.id))
			throw new AiToolInputError(
				'Uma das pessoas não foi encontrada. Use as marcações do pedido ou owner_find_chats; não invente IDs.'
			);
		const known = [
			...new Set(
				[id, person.id, ...(person.aliases || [])].filter(isPersonId).map(contactId)
			),
		];
		if (aliases.some(other => known.some(alias => other.includes(alias)))) continue;
		aliases.push(known);
		contacts.push({
			id: person.id,
			publicName: String(person.name || person.id.split('@')[0]),
			privateName: '',
			isBlocked: false,
			hostAdded: false,
			isGroup: false,
			isHostAccount: false,
		});
	}
	if (contacts.length) {
		const result = await r.ask.boundary(r.message.boundaryName, 'group_chat_info', {
			chatId,
		});
		const group = result.response as GroupChat | undefined;
		if (
			!group?.participants?.length ||
			aliases.some(
				known =>
					!group.participants.some(member => known.includes(contactId(member.id)))
			)
		)
			throw new AiToolInputError(
				'As pessoas selecionadas precisam participar do grupo de destino. Confira os IDs e o grupo antes de preparar o lembrete.'
			);
	}
	const immediateArg = `${args.duration} ${args.text.trim()}${contacts.length ? ' --pessoas ' + contacts.map(p => '@' + p.id.split('@')[0]).join(' ') : ''}${args.private ? ' --privado' : ''}`;
	try {
		parseReminder(immediateArg);
	} catch (error) {
		throw new AiToolInputError((error as Error).message);
	}
	return {
		immediateArg,
		contacts,
		duration: args.duration,
		text: args.text.trim(),
		private: args.private,
	};
};
