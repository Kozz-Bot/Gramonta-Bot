import { createMethod, createModule } from 'kozz-module-maker';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import type { GroupChat } from 'kozz-types';
import { areCommandsDisabledForGroup } from '../Group/groupState';
import { isUserMutted } from '../../Proxies/Mute/mutedDB';
import {
	contactId,
	consolidatePeople,
	createReminderStore,
	isPersonId,
	parseReminder,
	Person,
	ReminderError,
} from './store';
import { Card, deliveryBody, Help, List, Notice } from './messages';
import { createReminderRunner } from './scheduler';
import { reportCommandOutcome } from '../../Services/OwnerAI/contracts';
import { registerReminderContract } from './ai';
import { currentChatScope } from '../../Services/ChatCommands/scope';

export const startLembreteHandler = () => {
	registerReminderContract();
	let store: ReturnType<typeof createReminderStore>;
	try {
		store = createReminderStore();
	} catch {
		console.error(
			'[Lembrete] Agenda inválida; módulo não iniciado para preservar os dados.'
		);
		return;
	}
	let runtime: ReturnType<typeof createModule>;
	const ask = async (
		resource: string,
		args: Record<string, unknown> = {},
		timeout = 15000
	) => {
		if (!runtime.socket.connected)
			throw new ReminderError(
				'O WhatsApp está indisponível agora. Tente novamente em instantes.'
			);
		let event: string | undefined;
		const capture = (name: string, payload: { request?: { id?: string } }) => {
			if (name === 'ask_resource' && payload.request?.id)
				event = `reply_resource/${payload.request.id}`;
		};
		runtime.socket.onAnyOutgoing(capture);
		const request = runtime.ask.boundary('kozz-zapo', resource, args);
		runtime.socket.offAnyOutgoing(capture);
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return (
				await Promise.race([
					request,
					new Promise<never>((_, reject) => {
						timer = setTimeout(() => reject(new Error('Resource timeout')), timeout);
					}),
				])
			).response;
		} finally {
			if (timer) clearTimeout(timer);
			if (event) runtime.socket.removeAllListeners(event);
		}
	};
	const identify = async (raw: string): Promise<Person> => {
		const id = contactId(raw || '');
		if (!isPersonId(id))
			throw new ReminderError(
				'Não consegui identificar uma das pessoas. Marque o contato pelo WhatsApp.'
			);
		const mapping = (await ask(
			id.endsWith('@lid') ? 'jid_from_lid' : 'lid_from_jid',
			{ id }
		)) as { jid?: string; lid?: string } | undefined;
		const aliases = [
			...new Set(
				[id, mapping?.jid, mapping?.lid]
					.filter((v): v is string => Boolean(v))
					.map(contactId)
					.filter(isPersonId)
			),
		];
		return { id: aliases.find(v => v.endsWith('@s.whatsapp.net')) || id, aliases };
	};
	const people = async (
		r: MessageObj,
		chatId: string,
		owner: Person,
		tokens?: string[],
		requireMention = false
	) => {
		const tagged = [
			...new Set((r.message.taggedContacts || []).map(contact => contact.id)),
		];
		if (tagged.length > 20)
			throw new ReminderError('Marque no máximo 20 pessoas por lembrete.');
		let recipients = consolidatePeople(await Promise.all(tagged.map(identify)));
		if (tokens) {
			if (
				!tokens.every(token =>
					recipients.some(p => p.aliases.some(id => id.split('@')[0] === token))
				)
			)
				throw new ReminderError(
					'Selecione as pessoas na lista de contatos do WhatsApp ao marcar. Números digitados sem uma menção não entram na lista.'
				);
			recipients = recipients.filter(p =>
				p.aliases.some(id => tokens.includes(id.split('@')[0]))
			);
		}
		if (!recipients.length && requireMention)
			throw new ReminderError('Marque pelo menos uma pessoa com @ no WhatsApp.');
		if (!recipients.length) return [owner];
		if (!chatId.endsWith('@g.us'))
			throw new ReminderError(
				'A lista de pessoas e os avisos adicionais no privado são usados em grupos.'
			);
		const group = (await ask('group_chat_info', { chatId })) as
			GroupChat | undefined;
		if (
			!group?.participants?.length ||
			recipients.some(
				p =>
					!group.participants.some(member =>
						p.aliases.includes(contactId(member.id))
					)
			)
		)
			throw new ReminderError(
				'Todas as pessoas da lista precisam estar neste grupo. Confira as marcações e tente novamente.'
			);
		return recipients;
	};
	const execute = (method: string) =>
		createMethod(method, async r => {
			try {
				const chatId = r.message.chatId || r.message.to;
				if (
					r.message.boundaryName !== 'kozz-zapo' ||
					!chatId ||
					(!chatId.endsWith('@g.us') && !isPersonId(chatId))
				)
					throw new ReminderError(
						'Use !lembrete em um chat do WhatsApp do Gramonta.'
					);
				const original = /^[!\/]lembrete(?:\s+|$)([\s\S]*)$/i.exec(
					r.message.body || ''
				);
				const query = original
					? original[1].trim()
					: r.rawCommand?.query?.trim() || '';
				const arg = original
					? query.replace(/^\S+\s*/, '')
					: r.rawCommand?.immediateArg?.trim() || '';
				if (method === 'help' || (method === 'default' && !query))
					return r.reply(<Help />);
				if (method === 'lista')
					return r.reply(<List reminders={store.list('kozz-zapo', chatId)} />);
				if (['default', 'fallback', 'criar'].includes(method)) {
					const parsed = parseReminder(method === 'criar' ? arg : query);
					if (currentChatScope() && parsed.private)
						throw new ReminderError(
							'Pela IA, o lembrete fica somente neste chat, sem avisos no privado.'
						);
					if (parsed.private && !chatId.endsWith('@g.us'))
						throw new ReminderError(
							'Use --privado em um grupo para enviar avisos individuais além do grupo.'
						);
					const owner = await identify(r.message.from);
					const recipients = await people(
						r,
						chatId,
						owner,
						parsed.peopleTokens,
						parsed.explicitPeople
					);
					const now = Date.now();
					const reminder = store.create({
						boundary: 'kozz-zapo',
						chatId,
						chatName: (r.message.groupName || 'de origem').slice(0, 120),
						owner,
						text: parsed.text,
						due: now + parsed.duration,
						created: now,
						recipients,
						private: parsed.private,
						...(currentChatScope() ? { localOnly: true } : {}),
					});
					reportCommandOutcome(r.rawCommand, {
						success: true,
						scheduled: true,
						reminderId: reminder.id,
					});
					return r.reply(<Card reminder={reminder} />);
				}
				const match = /^([a-f0-9]{16})(?:\s+([\s\S]*))?$/i.exec(arg);
				if (!match)
					throw new ReminderError(
						'Informe o código do lembrete. Use !lembrete lista para consultar.'
					);
				const id = match[1],
					extra = match[2]?.trim();
				const reminder = store.get('kozz-zapo', chatId, id);
				if (method === 'ver' || (method === 'pessoas' && !extra))
					return r.reply(<Card reminder={reminder} />);
				const actor = await identify(r.message.from);
				if (method === 'cancelar') {
					if (extra) throw new ReminderError('Use !lembrete cancelar CÓDIGO');
					return r.reply(
						<Card
							reminder={store.change(
								'kozz-zapo',
								chatId,
								id,
								actor,
								r.message.fromHostAccount,
								{ cancel: true }
							)}
						/>
					);
				}
				if (method === 'pessoas') {
					if (currentChatScope() && reminder.private)
						throw new ReminderError(
							'Esse lembrete tem avisos em outros chats. Desative o privado antes de alterar a lista pela IA.'
						);
					if (!extra || !/^(?:@\d+(?:\s|,|;)*?)+$/.test(extra))
						throw new ReminderError(
							'Use !lembrete pessoas CÓDIGO @Ana @João, selecionando os contatos no WhatsApp.'
						);
					const tokens = [...extra.matchAll(/@(\d+)/g)].map(m => m[1]);
					const recipients = await people(r, chatId, actor, tokens, true);
					return r.reply(
						<Card
							reminder={store.change(
								'kozz-zapo',
								chatId,
								id,
								actor,
								r.message.fromHostAccount,
								{ recipients, ...(currentChatScope() ? { localOnly: true } : {}) }
							)}
						/>
					);
				}
				if (method === 'privado') {
					if (currentChatScope() && extra?.toLowerCase() === 'on')
						throw new ReminderError('A IA só pode agendar avisos neste chat.');
					if (
						!chatId.endsWith('@g.us') ||
						!extra ||
						!['on', 'off'].includes(extra.toLowerCase())
					)
						throw new ReminderError('Use no grupo: !lembrete privado CÓDIGO on/off');
					return r.reply(
						<Card
							reminder={store.change(
								'kozz-zapo',
								chatId,
								id,
								actor,
								r.message.fromHostAccount,
								{
									private: extra.toLowerCase() === 'on',
									...(currentChatScope() ? { localOnly: true } : {}),
								}
							)}
						/>
					);
				}
			} catch (error) {
				reportCommandOutcome(r.rawCommand, {
					success: false,
					error:
						error instanceof ReminderError
							? error.message
							: 'Não foi possível confirmar o agendamento.',
				});
				return r.reply(
					<Notice
						text={
							error instanceof ReminderError
								? error.message
								: 'Não consegui concluir o agendamento agora. Confira !lembrete lista antes de tentar novamente.'
						}
					/>
				);
			}
		});
	runtime = createModule({
		name: 'lembrete',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['kozz-zapo'],
			methods: {
				...execute('default'),
				...execute('fallback'),
				...execute('criar'),
				...execute('help'),
				...execute('lista'),
				...execute('ver'),
				...execute('pessoas'),
				...execute('privado'),
				...execute('cancelar'),
			},
		},
	}).resources.upsertResource('help', () => <Help />);
	const tick = createReminderRunner({
		store,
		allowed: reminder =>
			(!reminder.chatId.endsWith('@g.us') ||
				!areCommandsDisabledForGroup(reminder.chatId)) &&
			!isUserMutted(reminder.owner, reminder.chatId),
		ready: async () => {
			if (!runtime.socket.connected) return false;
			const status = (await ask('chat_status')) as
				{ connected?: boolean; registered?: boolean; hasQr?: boolean } | undefined;
			return (
				status?.connected === true &&
				status.registered === true &&
				status.hasQr === false
			);
		},
		send: async (reminder, delivery) =>
			(await ask(
				'send_reminder',
				{
					reminderId: reminder.id,
					chatId: delivery.chatId,
					body: deliveryBody(reminder, delivery.kind),
					mentions:
						delivery.kind === 'origin' && reminder.chatId.endsWith('@g.us')
							? reminder.recipients.map(p => p.id)
							: [],
				},
				65000
			)) as { submitted?: boolean },
	});
	const run = () => {
		void tick().catch(() =>
			console.warn(
				'[Lembrete] Não foi possível verificar a agenda; dados preservados.'
			)
		);
	};
	const timer = setInterval(run, 15000);
	timer.unref();
	runtime.socket.on('introduction_ack', (ack: { success?: boolean }) => {
		if (ack?.success) run();
	});
	return runtime;
};
