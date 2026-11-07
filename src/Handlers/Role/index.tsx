import { createMethod, createModule } from 'kozz-module-maker';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import {
	createRoleStore,
	edit,
	Person,
	RoleError,
	RoleEvent,
	parseEvent,
} from './events';
import type { Media } from 'kozz-types';
import { roleArtwork } from './artwork';
import { Card, EventList, Help, Notice } from './messages';
import { reportCommandOutcome } from '../../Services/OwnerAI/contracts';

// Resource requests clean up their socket listener even when a boundary stops responding.
const ask = async (
	runtime: ReturnType<typeof createModule>,
	boundary: string,
	resource: string,
	args: Record<string, unknown>,
	timeout = 15000
) => {
	if (!runtime.socket.connected) throw new Error('Gateway indisponível');
	let replyEvent: string | undefined;
	const capture = (event: string, payload: { request?: { id?: string } }) => {
		if (event === 'ask_resource' && payload.request?.id)
			replyEvent = `reply_resource/${payload.request.id}`;
	};
	runtime.socket.onAnyOutgoing(capture);
	const request = runtime.ask.boundary(boundary, resource, args);
	runtime.socket.offAnyOutgoing(capture);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return (
			await Promise.race([
				request,
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error('Boundary indisponível')),
						timeout
					);
				}),
			])
		).response;
	} finally {
		if (timer) clearTimeout(timer);
		if (replyEvent) runtime.socket.removeAllListeners(replyEvent);
	}
};

export const startRoleHandler = () => {
	let store: ReturnType<typeof createRoleStore>;
	try {
		store = createRoleStore();
	} catch {
		console.error('[Role] Dados persistidos inválidos; comando não iniciado.');
		return;
	}
	let runtime: ReturnType<typeof createModule>;
	const queues = new Map<string, Promise<unknown>>();
	const identify = async (r: MessageObj): Promise<Person> => {
		const clean = (s: string) => s.replace(/:\d+(?=@)/, '');
		const from = clean(r.message.from);
		const aliases = [
			from,
			r.message.contact?.id && clean(r.message.contact.id),
		].filter((s): s is string => Boolean(s));
		if (!aliases.some(id => /^\d+@(s\.whatsapp\.net|lid)$/.test(id)))
			throw new RoleError(
				'Não consegui identificar o participante. Tente novamente.'
			);
		if (from.endsWith('@lid')) {
			const mapping = (await ask(runtime, r.message.boundaryId, 'jid_from_lid', {
				id: from,
			})) as { jid?: string } | undefined;
			if (mapping?.jid) aliases.push(clean(mapping.jid));
		} else {
			const mapping = (await ask(runtime, r.message.boundaryId, 'lid_from_jid', {
				id: from,
			})) as { lid?: string } | undefined;
			if (mapping?.lid) aliases.push(clean(mapping.lid));
		}
		return {
			id: aliases.find(id => id.endsWith('@s.whatsapp.net')) || from,
			aliases: [...new Set(aliases)],
		};
	};
	const native = async (event: RoleEvent, artwork?: Media) => {
		try {
			const result = (await ask(
				runtime,
				event.boundaryId,
				'group_event',
				{
					chatId: event.chatId,
					eventId: event.id,
					revision: event.revision,
					title: event.title,
					location: event.location,
					start: event.start,
					end: event.end,
					cancelled: event.cancelled,
					artwork,
				},
				125000
			)) as { submitted?: boolean } | undefined;
			event.nativeState = result?.submitted === true ? 'submitted' : 'uncertain';
		} catch {
			event.nativeState = 'uncertain';
		}
		store.put(event);
	};
	const execute = (method: string) =>
		createMethod(method, async r => {
			const chatId = r.message.chatId || r.message.to;
			if (!chatId?.endsWith('@g.us')) {
				reportCommandOutcome(r.rawCommand, {
					success: false,
					error: 'Use !evento em um grupo do WhatsApp.',
				});
				return r.reply(<Notice text="Use !evento em um grupo do WhatsApp." />);
			}
			const key = `${r.message.boundaryId}:${chatId}`;
			const previous = queues.get(key) || Promise.resolve();
			const task = previous
				.catch(() => {})
				.then(async () => {
					// The gateway forwards an alias's full query as immediateArg. Recover the
					// original text so title words and explicit subcommands are not duplicated.
					const aliasText = /^[!\/](?:evento|rolê)(?:\s+|$)([\s\S]*)$/i.exec(
						r.message.body || ''
					);
					const query = aliasText
						? aliasText[1].trim()
						: r.rawCommand?.query?.trim() || '';
					const arg = aliasText
						? query.replace(/^\S+\s*/, '')
						: r.rawCommand?.immediateArg?.trim() || '';
					const input = method === 'criar' ? arg : query;
					try {
						if (method === 'help' || (method === 'default' && !query))
							return r.reply(<Help />);
						if (method === 'lista')
							return r.reply(
								<EventList events={store.list(r.message.boundaryId, chatId)} />
							);
						if (['default', 'fallback', 'criar'].includes(method)) {
							parseEvent(input);
							const artwork = await roleArtwork(r);
							const person = await identify(r);
							const event = store.create(
								r.message.boundaryId,
								chatId,
								person,
								input
							);
							await native(event, artwork);
							reportCommandOutcome(r.rawCommand, {
								success: event.nativeState === 'submitted',
								eventId: event.id,
								status:
									event.nativeState === 'submitted' ? 'submitted' : 'uncertain',
								error:
									event.nativeState !== 'submitted'
										? 'Publicação incerta: confira a arte e os eventos do grupo antes de repetir.'
										: undefined,
							});
							if (event.nativeState !== 'submitted')
								return r.reply(
									<Notice
										text={`Não consegui confirmar a publicação completa do rolê ${event.id}. Confira a arte e os eventos do grupo antes de repetir.`}
									/>
								);
							// Success ends with the native event, without an extra bot card below it.
							return;
						}
						const match = /^([a-f0-9]{10})(?:\s+([\s\S]*))?$/i.exec(arg);
						if (!match || (!['editar'].includes(method) && match[2]))
							throw new RoleError(
								'Informe o código: !evento ' +
									method +
									' CÓDIGO. Veja os códigos com !evento lista.'
							);
						let event = store.get(r.message.boundaryId, chatId, match[1]);
						if (method === 'editar' || method === 'cancelar') {
							const person = await identify(r);
							if (method === 'editar' && !match[2])
								throw new RoleError(
									'Use !evento editar CÓDIGO Título | DD/MM/AAAA HHhMM | Local'
								);
							event = edit(
								event,
								person,
								r.message.fromHostAccount,
								method === 'editar' ? match[2] : undefined
							);
							store.put(event);
							await native(event);
							reportCommandOutcome(r.rawCommand, {
								success: event.nativeState === 'submitted',
								eventId: event.id,
								status:
									event.nativeState === 'submitted' ? 'submitted' : 'uncertain',
								error:
									event.nativeState !== 'submitted'
										? 'Alteração incerta: confira o evento original antes de repetir.'
										: undefined,
							});
							if (event.nativeState !== 'submitted')
								return r.reply(
									<Notice
										text={`Não consegui confirmar a alteração do evento ${event.id}. Confira o grupo antes de repetir.`}
									/>
								);
							return;
						}
						if (method === 'ver') return r.reply(<Card event={event} />);
					} catch (error) {
						reportCommandOutcome(r.rawCommand, {
							success: false,
							error:
								error instanceof RoleError
									? error.message
									: 'Não foi possível confirmar a operação do evento.',
						});
						return r.reply(
							<Notice
								text={
									error instanceof RoleError
										? error.message
										: 'Não consegui concluir agora. Consulte !evento lista antes de repetir uma criação. Se o problema continuar, tente novamente mais tarde.'
								}
							/>
						);
					}
				});
			queues.set(key, task);
			try {
				await task;
			} finally {
				if (queues.get(key) === task) queues.delete(key);
			}
		});
	runtime = createModule({
		name: 'role',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['kozz-zapo'],
			aliases: [
				{ name: 'evento', target: {} },
				{ name: 'rolê', target: {} },
			],
			methods: {
				...execute('default'),
				...execute('fallback'),
				...execute('criar'),
				...execute('lista'),
				...execute('ver'),
				...execute('editar'),
				...execute('cancelar'),
				...execute('help'),
			},
		},
	}).resources.upsertResource('help', () => <Help />);
	return runtime;
};
