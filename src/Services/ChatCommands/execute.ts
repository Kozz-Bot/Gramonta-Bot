import type { MessageObj } from 'kozz-module-maker/dist/Message';
import type { Command, ContactPayload, MessageReceivedByGateway } from 'kozz-types';
import { isArgsObjectValid } from 'kozz-module-maker/dist/Validator';
import { moduleCatalog, invokeModule, ownerAiSocket } from '../OwnerAI/modules';
import { aiContract, AiToolInputError } from '../OwnerAI/contracts';
import { isPanelRequester, isAgentRequester } from '../OwnerAI/control';
import { contactId, isPersonId, parseReminder } from '../../Handlers/Lembrete/store';
import { parseEvent } from '../../Handlers/Role/events';
import { normalizeBanId } from '../Bans/store';
import { assertChatMethod, chatMethodAllowed } from './policy';
import { ChatScope, inChatScope } from './scope';
import {
	ActionStatus,
	executeOnce,
	generatedImage,
	ToolExecutionResult,
} from '../AiExecution';

type Member = { id: string; name: string; aliases: string[] };
type Context = {
	chatId: string;
	members: Member[];
	personIds: Set<string>;
	messages: Set<string>;
};
const contexts = new WeakMap<MessageObj, Promise<Context>>();
const read = async (
	r: MessageObj,
	name: string,
	data: Record<string, unknown>,
	handler?: string
) => {
	const socket = ownerAiSocket();
	let event: string | undefined;
	const capture = (type: string, payload: any) => {
		if (type === 'ask_resource') event = `reply_resource/${payload.request.id}`;
	};
	socket?.onAnyOutgoing(capture);
	const request = handler
		? r.ask.handler(handler, name, data)
		: r.ask.boundary(r.message.boundaryName, name, data);
	socket?.offAnyOutgoing(capture);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return (
			await Promise.race([
				request,
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() =>
							reject(
								new AiToolInputError(
									handler
										? 'Não consegui consultar a ajuda desse comando agora.'
										: 'Não consegui consultar os participantes deste chat agora.'
								)
							),
						handler ? 5000 : 35000
					);
				}),
			])
		).response;
	} finally {
		if (timer) clearTimeout(timer);
		if (event) socket?.removeAllListeners(event);
	}
};
export const sourceChatId = (r: MessageObj) => {
	const id = r.message.chatId || r.message.to;
	if (
		isPanelRequester(r) ||
		isAgentRequester(r) ||
		r.message.boundaryName !== 'kozz-zapo' ||
		(r.message.namespace && r.message.namespace !== 'default') ||
		!r.message.id ||
		(!isPersonId(id) && !/^\d+(?:-\d+)?@g\.us$/.test(id))
	)
		throw new AiToolInputError(
			'Esse atalho só pode ser usado no chat original do WhatsApp do Gramonta.'
		);
	return id;
};
export const chatContext = (r: MessageObj) => {
	const chatId = sourceChatId(r);
	if (!contexts.has(r))
		contexts.set(
			r,
			(async () => {
				const result = chatId.endsWith('@g.us')
					? ((await read(r, 'group_members', { chatId, limit: 2048 })) as {
							matches?: Member[];
						})
					: undefined;
				if (chatId.endsWith('@g.us') && !Array.isArray(result?.matches))
					throw new AiToolInputError(
						'Não consegui verificar os participantes deste grupo.'
					);
				const members = result?.matches || [];
				const personIds = new Set(
					[
						r.message.from,
						r.message.contact?.id,
						...(isPersonId(chatId) ? [chatId] : []),
						...members.flatMap(m => [m.id, ...(m.aliases || [])]),
					]
						.filter((id): id is string => typeof id === 'string')
						.map(contactId)
				);
				const messages = new Set<string>();
				let q: MessageReceivedByGateway | undefined = r.message;
				for (let depth = 0; q && depth < 8; depth++, q = q.quotedMessage) {
					if ((q.chatId || q.to) !== chatId) break;
					messages.add(q.id);
				}
				return { chatId, members, personIds, messages };
			})()
		);
	return contexts.get(r)!;
};
const text = (value: unknown, max = 4000) => {
	if (typeof value !== 'string' || value.length > max)
		throw new AiToolInputError('Argumento textual inválido.');
	return value;
};
const keys = (args: Record<string, unknown>, allowed: string[]) => {
	if (Object.keys(args).some(key => !allowed.includes(key)))
		throw new AiToolInputError(
			'Essa ferramenta não aceita destino, identidade ou parâmetros extras. A ação fica somente neste chat.'
		);
};
const aliases: Record<string, { module: string; method?: string }> = {
	evento: { module: 'role' },
	rolê: { module: 'role' },
	unban: { module: 'ban', method: 'unban' },
	banlist: { module: 'ban', method: 'list' },
	mudos: { module: 'faladores', method: 'mudos' },
};
const moduleName = (s: string) => aliases[s]?.module || s;
const contacts = async (
	r: MessageObj,
	ctx: Context,
	values: unknown,
	useOriginal: boolean
): Promise<ContactPayload[]> => {
	const ids =
		values === undefined ||
		(Array.isArray(values) && values.length === 0 && useOriginal)
			? (r.message.taggedContacts || []).map(p => p.id)
			: values;
	if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => !isPersonId(id)))
		throw new AiToolInputError(
			'Informe até 20 IDs reais de participantes deste grupo.'
		);
	const result: ContactPayload[] = [],
		seen = new Set<string>();
	for (const id of ids) {
		const member = ctx.members.find(m => m.id === id || m.aliases?.includes(id));
		if ((!member && ctx.chatId.endsWith('@g.us')) || !ctx.personIds.has(id))
			throw new AiToolInputError('Uma das pessoas não pertence ao chat de origem.');
		const canonical = member?.id || id;
		if (seen.has(canonical)) continue;
		seen.add(canonical);
		const person = (await read(r, 'contact_info', { id: canonical })) as
			ContactPayload | undefined;
		if (!person || !isPersonId(person.id))
			throw new AiToolInputError('Não consegui identificar um dos participantes.');
		ctx.personIds.add(person.id);
		result.push({ ...person });
	}
	return result;
};
const quote = (
	message: MessageReceivedByGateway | undefined,
	chatId: string,
	depth = 0
): MessageReceivedByGateway | undefined => {
	if (!message || depth > 6 || (message.chatId || message.to) !== chatId)
		return undefined;
	return {
		...message,
		to: chatId,
		chatId,
		quotedMessage: quote(message.quotedMessage, chatId, depth + 1),
	};
};

export const executeChatTool = async (
	r: MessageObj,
	name: string,
	args: Record<string, unknown>
): Promise<ToolExecutionResult> => {
	sourceChatId(r);
	if (!args || typeof args !== 'object' || Array.isArray(args))
		throw new AiToolInputError('Argumentos inválidos.');
	if (name === 'chat_list_commands') {
		keys(args, ['module']);
		const filter = moduleName(text(args.module, 80));
		const catalog = moduleCatalog()
			.map(m => ({
				...m,
				methods: m.methods.filter(method =>
					chatMethodAllowed(
						m.name,
						method.method,
						r.message.fromHostAccount === true
					)
				),
			}))
			.filter(m => m.methods.length && (!filter || m.name === filter));
		// Schemas describe flags, but legacy commands put their syntax only in help.
		// Fetch it for a selected module instead of flooding the complete catalogue.
		let help: unknown;
		if (filter && catalog.length && typeof r.ask?.handler === 'function') {
			try {
				help = await read(r, 'help', {}, filter);
			} catch {
				help = 'Ajuda indisponível no momento; não invente a sintaxe.';
			}
		}
		return {
			terminal: false,
			content: JSON.stringify(
				catalog.map(entry => ({
					...entry,
					...(typeof help === 'string' ? { help: help.slice(0, 12000) } : {}),
				}))
			),
		};
	}
	if (name === 'chat_find_members') {
		keys(args, ['query']);
		const query = text(args.query, 100)
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase();
		const ctx = await chatContext(r);
		const matches = ctx.members.filter(
			m =>
				!query ||
				m.name
					.normalize('NFD')
					.replace(/[\u0300-\u036f]/g, '')
					.toLowerCase()
					.includes(query) ||
				[m.id, ...m.aliases].some(id => id.includes(query))
		);
		return {
			terminal: false,
			content: JSON.stringify({
				matches: matches.slice(0, 30),
				total: matches.length,
				truncated: matches.length > 30,
			}),
		};
	}
	let module: string,
		method: string,
		input: string,
		namedArgs: Record<string, unknown> = {},
		recipientValues: unknown,
		original = true;
	if (name === 'chat_create_reminder') {
		keys(args, ['duration', 'text', 'recipientIds']);
		const duration = text(args.duration, 80),
			body = text(args.text, 2000);
		if (!body.trim() || /(?:^|\s)--/.test(body))
			throw new AiToolInputError(
				'Escreva somente o texto do lembrete, sem flags ou comandos.'
			);
		input = `${duration} ${body.trim()}`;
		try {
			parseReminder(input);
		} catch (error) {
			throw new AiToolInputError((error as Error).message);
		}
		module = 'lembrete';
		method = 'criar';
		recipientValues = args.recipientIds;
		original = false;
	} else if (name === 'chat_create_event') {
		keys(args, ['title', 'dateTime', 'location', 'imageRef']);
		const fields = [
			text(args.title, 120),
			text(args.dateTime, 80),
			text(args.location, 250),
		];
		if (fields.some(value => value.includes('|')))
			throw new AiToolInputError('Os campos do evento não podem conter |.');
		input = fields.join(' | ');
		try {
			parseEvent(input);
		} catch (error) {
			throw new AiToolInputError((error as Error).message);
		}
		module = 'role';
		method = 'criar';
	} else if (name === 'chat_execute_command') {
		keys(args, [
			'module',
			'method',
			'immediateArg',
			'namedArgs',
			'recipientIds',
			'imageRef',
		]);
		const requestedModule = text(args.module, 80);
		module = moduleName(requestedModule);
		method = text(args.method, 80);
		if (aliases[requestedModule]?.method && ['default', 'fallback'].includes(method))
			method = aliases[requestedModule].method!;
		input = text(args.immediateArg);
		try {
			namedArgs = JSON.parse(text(args.namedArgs));
		} catch {
			throw new AiToolInputError('namedArgs precisa ser um objeto JSON válido.');
		}
		recipientValues = args.recipientIds;
	} else throw new AiToolInputError('Ferramenta indisponível neste chat.');
	assertChatMethod(module, method, input, r.message.fromHostAccount === true);
	const contractMethod = method,
		contractInput = input;
	const methods = moduleCatalog().find(m => m.name === module)?.methods;
	// A gateway fallback receives the first word as rawCommand.method. Sending
	// the literal word "fallback" breaks handlers such as Wordle and Horoscope.
	if (
		method === 'fallback' ||
		(method === 'default' && !methods?.some(m => m.method === 'default'))
	) {
		const parts = input.trim().match(/^(\S+)(?:\s+([\s\S]*))?$/);
		if (parts) {
			method = parts[1];
			input = parts[2] || '';
		}
	}
	const entry =
		methods?.find(m => m.method === method) ||
		methods?.find(m => m.method === 'fallback');
	if (!entry)
		throw new AiToolInputError(
			'Comando fora do catálogo. Consulte chat_list_commands.'
		);
	assertChatMethod(module, entry.method, input, r.message.fromHostAccount === true);
	if (
		!namedArgs ||
		Array.isArray(namedArgs) ||
		typeof namedArgs !== 'object' ||
		Object.keys(namedArgs).some(
			key =>
				['abort', '__proto__', 'constructor', 'prototype'].includes(key) ||
				!Object.hasOwn(entry.args, key)
		) ||
		!isArgsObjectValid(namedArgs, entry.args)
	)
		throw new AiToolInputError('Argumentos incompatíveis com o comando.');
	const ctx = await chatContext(r);
	let selected: ContactPayload[];
	if (module === 'ban' && typeof namedArgs.targetId === 'string') {
		let id: string;
		try {
			id = normalizeBanId(namedArgs.targetId);
		} catch {
			throw new AiToolInputError(
				'Informe um número com país e DDD ou um ID verificado.'
			);
		}
		const explicit = await contacts(r, ctx, [id], false);
		if (Array.isArray(recipientValues) && recipientValues.length) {
			const recipients = await contacts(r, ctx, recipientValues, false);
			if (recipients.length !== 1 || recipients[0].id !== explicit[0].id)
				throw new AiToolInputError(
					'Informe uma única pessoa para banir ou liberar, sem destinos conflitantes.'
				);
		}
		// Explicit verified target wins over implicit mentions of the original
		// message. The handler receives one target representation, never both.
		selected = explicit;
		delete namedArgs.targetId;
	} else {
		selected = await contacts(r, ctx, recipientValues, original);
	}
	if (name === 'chat_create_reminder' && selected.length) {
		if (!ctx.chatId.endsWith('@g.us'))
			throw new AiToolInputError(
				'A lista de pessoas só pode ser usada neste grupo.'
			);
		input += ' --pessoas ' + selected.map(p => '@' + p.id.split('@')[0]).join(' ');
	}
	aiContract(module)?.validate?.(
		contractMethod,
		method !== contractMethod ? contractInput : input,
		ctx.chatId
	);
	const image = generatedImage(r, args.imageRef);
	const query = ['default', 'fallback'].includes(method)
		? input
		: `${method} ${input}`.trim();
	const command: Command = {
		module,
		method,
		immediateArg: input || null,
		namedArgs: namedArgs as Command['namedArgs'],
		query,
		boundaryId: r.message.boundaryId,
		boundaryName: r.message.boundaryName,
		namespace: 'default',
		taggedContacts: selected,
		message: {
			...r.message,
			chatId: ctx.chatId,
			to: ctx.chatId,
			body: `!${module} ${query}`,
			santizedBody: `!${module} ${query}`,
			quotedMessage: image ? undefined : quote(r.message.quotedMessage, ctx.chatId),
			taggedContacts: selected,
			...(image ? { media: image, messageType: 'IMAGE' } : {}),
		},
	};
	let signature: unknown = {
		module,
		method,
		input,
		namedArgs,
		recipients: selected.map(p => p.id).sort(),
		imageRef: args.imageRef || '',
	};
	if (['criar', 'default', 'fallback'].includes(method)) {
		if (module === 'role' && input)
			signature = { module, method: 'criar', event: parseEvent(input) };
		if (module === 'lembrete' && input) {
			const parsed = parseReminder(input);
			const effective = parsed.peopleTokens?.length
				? selected.filter(person => {
						const member = ctx.members.find(
							m => m.id === person.id || m.aliases?.includes(person.id)
						);
						return [person.id, ...(member?.aliases || []), member?.id || ''].some(
							id => parsed.peopleTokens!.includes(id.split('@')[0])
						);
					})
				: selected;
			signature = {
				module,
				method: 'criar',
				duration: parsed.duration,
				text: parsed.text,
				private: parsed.private,
				recipients: (effective.length
					? effective.map(p => p.id)
					: [r.message.from]
				).sort(),
			};
		}
	}
	const perform = async () => {
		const scope: ChatScope = {
			updateGroupsControl:
				module === 'updates' && r.message.fromHostAccount === true,
			chatId: ctx.chatId,
			boundaryId: r.message.boundaryId,
			boundaryName: r.message.boundaryName,
			personIds: new Set(ctx.personIds),
			messageIds: new Set(ctx.messages),
			replies: [],
		};
		try {
			const result = await inChatScope(scope, () => invokeModule(command));
			const outcome = result && 'outcome' in result ? result.outcome : undefined;
			const status: ActionStatus = scope.violation
				? 'uncertain'
				: outcome?.status ||
					(outcome?.success
						? outcome.scheduled
							? 'scheduled'
							: 'completed'
						: result?.executed
							? 'invoked'
							: 'failed');
			return {
				success: scope.violation
					? false
					: (outcome?.success ?? (result?.executed ? null : false)),
				status,
				module,
				method,
				outcome,
				replies: scope.replies,
				error:
					scope.violation ||
					outcome?.error ||
					(!result?.executed
						? 'O comando foi bloqueado pelas regras ou permissões deste chat.'
						: undefined),
				note:
					status === 'invoked'
						? 'O handler terminou, mas não fornece confirmação estruturada do efeito. Consulte suas respostas; não invente sucesso.'
						: undefined,
			};
		} catch {
			return {
				success: false,
				status: 'uncertain' as const,
				module,
				method,
				replies: scope.replies,
				error:
					'Não foi possível confirmar o resultado. Não repita esta ação automaticamente; confira o chat.',
			};
		}
	};
	const readOnly =
		['help', 'lista', 'list', 'ver'].includes(method) ||
		(module === 'updates' && ['default', 'listar', 'buscar'].includes(method));
	const receipt = readOnly
		? { id: '', reused: false, value: await perform() }
		: await executeOnce(r, { command: signature }, perform);
	const action = {
		id: receipt.id,
		label: `!${module === 'role' ? 'evento' : module} ${method}`,
		status: receipt.value.status,
	};
	return {
		terminal: false,
		...(readOnly ? {} : { action }),
		content: JSON.stringify({
			...receipt.value,
			actionId: receipt.id || undefined,
			reused: receipt.reused,
			doNotRepeat: !readOnly,
		}),
	};
};
