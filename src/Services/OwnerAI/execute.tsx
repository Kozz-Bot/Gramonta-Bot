import { Line } from 'kozz-module-maker';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import type { Command } from 'kozz-types';
import { isArgsObjectValid } from 'kozz-module-maker/dist/Validator';
import {
	approvalQueue,
	auditOwnerAction,
	isPanelRequester,
	isAgentRequester,
	assertAgentTool,
	agentExecution,
	ownerAccess,
	ownerBoundary,
	ownerOrigin,
} from './control';
import { prepareGroupPicture } from './group-picture';
import { invokeModule, moduleCatalog } from './modules';
import { periodicGroups } from '../PeriodicStatus/groups';
import { parseEvent } from '../../Handlers/Role/events';
import { roleArtwork } from '../../Handlers/Role/artwork';
import { aiContract } from './contracts';
import { prepareReminderInput } from './reminder';

type Args = Record<string, unknown>;
const text = (value: unknown, max = 4000) => {
	if (typeof value !== 'string' || value.length > max)
		throw new Error('Argumento textual inválido.');
	return value;
};
const findTarget = async (r: MessageObj, id: string) => {
	if (!/^\d+(?:-\d+)?@(g\.us|s\.whatsapp\.net|lid)$/.test(id))
		throw new Error('Use o ID exato de um contato ou grupo pesquisado.');
	const result = await ownerBoundary(r, 'search', {
		query: id,
		kind: id.endsWith('@g.us') ? 'group' : 'contact',
	});
	const target = result.matches?.find(
		(item: any) => item.id === id || item.aliases?.includes(id)
	);
	if (!target) throw new Error('Destino indisponível. Pesquise novamente.');
	return { id: target.id as string, name: target.name as string };
};
const prepare = async (
	r: MessageObj,
	operation: string,
	target: string,
	details: unknown,
	preview: string,
	perform: (r: MessageObj) => Promise<unknown>
) => {
	const action = async (confirmed: MessageObj) => {
		assertAgentTool(confirmed, operation, {
			...(details && typeof details === 'object' ? details : {}),
			chatId: target,
		});
		auditOwnerAction(operation, 'started', target);
		try {
			const result = await perform(confirmed);
			const outcome = result as { success?: boolean; invoked?: boolean } | undefined;
			auditOwnerAction(
				operation,
				outcome?.success === false || outcome?.invoked === false
					? 'not_completed'
					: 'completed',
				target
			);
			return result;
		} catch {
			auditOwnerAction(operation, 'failed_or_unknown', target);
			throw new Error(
				'Não foi possível comprovar a conclusão. Confira o destino antes de repetir.'
			);
		}
	};
	const execution = agentExecution(r);
	if (execution?.automatic) {
		if (!execution.executeAction)
			throw new Error('Execução autônoma sem registro de idempotência.');
		return {
			terminal: true as const,
			automatic: true as const,
			result: await execution.executeAction(() => action(r)),
		};
	}
	const token = approvalQueue.propose(
		JSON.stringify({ operation, target, details }),
		ownerOrigin(r),
		preview,
		action
	);
	r.reply.withButtons(
		<Line>{`[#CalvoGPT]: Confirma esta ação?\n\n${preview}\n\nVálida por 5 minutos. Só a conta proprietária pode confirmar.`}</Line>,
		{
			expiresInMs: 5 * 60_000,
			buttons: [
				{ id: 'accept', label: 'Aceitar', command: `!ai confirmar ${token}` },
				{ id: 'reject', label: 'Recusar', command: `!ai recusar ${token}` },
			],
		}
	);
	return { terminal: true as const, approvalId: token };
};

export const executeOwnerTool = async (r: MessageObj, name: string, args: Args) => {
	// Defence in depth: check every call, even if a forged/unsolicited tool call arrives.
	if (!(await ownerAccess(r)))
		throw new Error('Ferramenta restrita ao proprietário.');
	assertAgentTool(r, name, args);
	if (name === 'owner_set_group_subject' || name === 'owner_set_group_picture') {
		if (isPanelRequester(r) && !isAgentRequester(r))
			throw new Error(
				'Peça a alteração pelo !ai em uma mensagem da própria conta WhatsApp.'
			);
		const target = await findTarget(r, text(args.chatId, 100));
		if (!target.id.endsWith('@g.us'))
			throw new Error('O destino precisa ser um grupo.');
		if (name === 'owner_set_group_subject') {
			const subject = text(args.subject, 200);
			if (
				!subject.trim() ||
				[...subject].length > 100 ||
				/[\r\n\u0000-\u001f]/.test(subject)
			)
				throw new Error('Nome inválido: use uma linha com até 100 caracteres.');
			return prepare(
				r,
				name,
				target.id,
				{ subject },
				`Trocar nome de ${target.name} (${target.id}) para:\n${subject}\nA agenda automática desse grupo, se houver, continua ativa.`,
				async confirmed => {
					await findTarget(confirmed, target.id);
					const result = await ownerBoundary(confirmed, 'group_subject', {
						chatId: target.id,
						subject,
					});
					if (result.updated !== true) throw new Error('Nome não confirmado.');
					return result;
				}
			);
		}
		const imageBase64 = await prepareGroupPicture(
			r,
			text(args.source, 20),
			text(args.prompt)
		);
		// Generation may take minutes: revalidate the original device message before proposing.
		if (!(await ownerAccess(r)))
			throw new Error('Autorização expirada. Faça um novo pedido.');
		r.reply.withMedia.fromB64(
			imageBase64,
			'image',
			`Prévia da nova foto de ${target.name}. Aguarde os botões de confirmação.`
		);
		return prepare(
			r,
			name,
			target.id,
			{ imageBase64 },
			`Trocar a foto de ${target.name} (${target.id}) pela imagem mostrada acima.\nA agenda automática desse grupo, se houver, continua ativa.`,
			async confirmed => {
				await findTarget(confirmed, target.id);
				const result = await ownerBoundary(confirmed, 'group_picture', {
					chatId: target.id,
					imageBase64,
				});
				if (result.updated !== true) throw new Error('Foto não confirmada.');
				return result;
			}
		);
	}
	if (name === 'owner_find_chats')
		return {
			terminal: false as const,
			content: JSON.stringify(
				await ownerBoundary(r, 'search', {
					query: text(args.query, 120),
					kind: args.kind,
				})
			),
		};
	if (name === 'owner_chat_history')
		return {
			terminal: false as const,
			content: JSON.stringify(
				await ownerBoundary(r, 'history', {
					chatId: text(args.chatId, 100),
					start: text(args.start, 60),
					end: text(args.end, 60),
					offset: args.offset,
					limit: args.limit,
				})
			),
		};
	if (name === 'owner_list_commands') {
		const filter = text(args.module, 80);
		const catalog = moduleCatalog();
		return {
			terminal: false as const,
			content: JSON.stringify(
				filter
					? catalog.filter(m => m.name === filter)
					: catalog.map(m => ({
							name: m.name,
							methods: m.methods.map(method => method.method),
						}))
			),
		};
	}
	if (name === 'owner_periodic_posts')
		return {
			terminal: false as const,
			content: JSON.stringify(periodicGroups.load()),
		};
	if (name === 'owner_send_message') {
		const target = await findTarget(r, text(args.chatId, 100));
		const body = text(args.body);
		if (!body.trim() || /^[!/]\w/.test(body.trim()))
			throw new Error(
				'Informe uma mensagem de texto; comandos usam a ferramenta de módulos.'
			);
		return prepare(
			r,
			name,
			target.id,
			{ body },
			`Enviar mensagem para ${target.name} (${target.id}):\n\n${body}`,
			async confirmed => {
				await findTarget(confirmed, target.id);
				return ownerBoundary(confirmed, 'send', { chatId: target.id, body });
			}
		);
	}
	if (name === 'owner_set_periodic_posts') {
		const target = await findTarget(r, text(args.chatId, 100));
		if (!target.id.endsWith('@g.us') || typeof args.enabled !== 'boolean')
			throw new Error('Informe um grupo e ativação válida.');
		const enabled = args.enabled;
		const before = periodicGroups.load();
		const nextGroups = enabled
			? [...before.groups.filter(g => g.id !== target.id), target]
			: before.groups.filter(g => g.id !== target.id);
		const next = {
			enabled: enabled || (before.enabled && nextGroups.length > 0),
			groups: nextGroups,
		};
		return prepare(
			r,
			name,
			target.id,
			next,
			`${enabled ? 'Habilitar' : 'Remover'} posts periódicos em ${target.name} (${target.id}).\nServiço após a alteração: ${next.enabled ? 'ligado' : 'parado'}.\nGrupos selecionados: ${nextGroups.map(g => `${g.name} (${g.id})`).join(', ') || 'nenhum'}.\nUsará a agenda atual do !autostatus.`,
			async confirmed => {
				await findTarget(confirmed, target.id);
				if (JSON.stringify(periodicGroups.load()) !== JSON.stringify(before))
					throw new Error('Configuração mudou; peça nova prévia.');
				periodicGroups.save(next);
				return { updated: true };
			}
		);
	}
	if (
		name === 'owner_create_role' ||
		name === 'owner_create_reminder' ||
		name === 'owner_execute_command'
	) {
		let artwork: Awaited<ReturnType<typeof roleArtwork>>;
		let reminderInput: Awaited<ReturnType<typeof prepareReminderInput>> | undefined;
		if (name === 'owner_create_reminder') {
			const target = await findTarget(r, text(args.chatId, 100));
			reminderInput = await prepareReminderInput(r, args, target.id);
			args = {
				module: 'lembrete',
				method: 'criar',
				chatId: target.id,
				immediateArg: reminderInput.immediateArg,
				namedArgs: '{}',
			};
		}
		if (name === 'owner_create_role') {
			const title = text(args.title, 120),
				dateTime = text(args.dateTime, 80),
				location = text(args.location, 250);
			if ([title, dateTime, location].some(value => value.includes('|')))
				throw new Error('Não use o caractere | nos campos do evento.');
			const immediateArg = `${title} | ${dateTime} | ${location}`;
			parseEvent(immediateArg);
			if (!text(args.chatId, 100).endsWith('@g.us'))
				throw new Error('O destino do rolê precisa ser um grupo.');
			artwork = await roleArtwork(r);
			args = {
				module: 'role',
				method: 'criar',
				chatId: args.chatId,
				immediateArg,
				namedArgs: '{}',
			};
		}
		const module = text(args.module, 80),
			method = text(args.method, 80);
		const entry = moduleCatalog()
			.find(m => m.name === module)
			?.methods.find(m => m.method === method);
		if (!entry) throw new Error('Módulo ou método fora do catálogo.');
		const immediateArg = text(args.immediateArg);
		const namedArgs = JSON.parse(text(args.namedArgs));
		if (
			!namedArgs ||
			Array.isArray(namedArgs) ||
			typeof namedArgs !== 'object' ||
			Object.keys(namedArgs).some(k =>
				['abort', '__proto__', 'constructor', 'prototype'].includes(k)
			) ||
			Object.keys(namedArgs).some(k => !Object.hasOwn(entry.args, k)) ||
			!isArgsObjectValid(namedArgs, entry.args)
		)
			throw new Error('Argumentos incompatíveis com o schema.');
		const target = await findTarget(r, text(args.chatId, 100));
		aiContract(module)?.validate?.(method, immediateArg, target.id);
		const query = ['default', 'fallback'].includes(method)
			? immediateArg
			: `${method} ${immediateArg}`.trim();
		// Snapshot mentions from the original request, never from the confirmation click.
		const taggedContacts = structuredClone(
			reminderInput
				? reminderInput.contacts
				: target.id === r.message.chatId
					? r.message.taggedContacts || []
					: []
		);
		const reminderPreview = reminderInput
			? `Agendar lembrete em ${target.name} (${target.id})\nDaqui a: ${reminderInput.duration}, contados após confirmar\nTexto: ${reminderInput.text}\nPessoas: ${taggedContacts.map(c => c.publicName || c.id.split('@')[0]).join(', ') || 'quem fez o pedido'}\nAvisar também no privado: ${reminderInput.private ? 'sim' : 'não'}`
			: undefined;
		return prepare(
			r,
			name,
			target.id,
			{
				module,
				method,
				immediateArg,
				namedArgs,
				...(artwork ? { artwork } : {}),
				...(module === 'lembrete' ? { taggedContacts } : {}),
			},
			reminderPreview ||
				`Executar !${module === 'role' ? 'evento' : module} ${method} ${immediateArg}\nArgumentos nomeados: ${JSON.stringify(namedArgs)}\nDestino dos resultados: ${target.name} (${target.id}).\n${name === 'owner_create_role' ? (artwork ? 'Publicar a arte anexada/citada com marcação de TODOS os participantes e depois o evento nativo do WhatsApp.' : 'Publicar somente o evento nativo do WhatsApp, sem arte.') : 'O módulo pode enviar mensagens ou alterar configurações conforme esse comando.'}`,
			async confirmed => {
				await findTarget(confirmed, target.id);
				const command: Command = {
					module,
					method,
					immediateArg: immediateArg || null,
					namedArgs,
					boundaryId: confirmed.message.boundaryId,
					boundaryName: confirmed.message.boundaryName,
					namespace: 'default',
					query,
					taggedContacts,
					message: {
						...confirmed.message,
						id: target.id === r.message.chatId ? r.message.id : '',
						chatId: target.id,
						to: target.id,
						groupName: target.id.endsWith('@g.us') ? target.name : undefined,
						// Do not carry a quote or media from a different chat into a command.
						quotedMessage:
							name === 'owner_create_role'
								? undefined
								: target.id === r.message.chatId
									? r.message.quotedMessage
									: undefined,
						media:
							name === 'owner_create_role'
								? artwork
								: target.id === r.message.chatId
									? r.message.media
									: undefined,
						messageType:
							name === 'owner_create_role'
								? artwork
									? 'IMAGE'
									: 'TEXT'
								: confirmed.message.messageType,
						taggedContacts,
						body: `!${module} ${query}`,
						santizedBody: `!${module} ${query}`,
					},
				};
				const result = await invokeModule(command);
				const outcome = result && 'outcome' in result ? result.outcome : undefined;
				return {
					invoked: Boolean(result?.executed),
					...(outcome || {}),
					deliveryConfirmed: false,
				};
			}
		);
	}
	throw new Error('Ferramenta privada desconhecida.');
};
