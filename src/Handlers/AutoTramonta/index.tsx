import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { MessageReceivedByGateway, ReplyButton } from 'kozz-types';
import {
	AutoTramontaEngine,
	ChatLine,
	isSelfControl,
	normalizeId,
	Range,
} from '../../Services/AutoTramonta/engine';
import { createAutoStore } from '../../Services/AutoTramonta/store';
import { autoModel, generateAutoReply } from '../../Services/AutoTramonta/ai';
import {
	isAutoMessage,
	isOwnerMessage,
	stripAutoMarker,
} from '../../Services/AutoTramonta/identity';
import { sendAutoText } from '../../Services/AutoTramonta/transport';
import { areCommandsDisabledForGroup } from '../Group/groupState';
import { isUserMutted } from '../../Proxies/Mute/mutedDB';
import { GroupCard, Help, Menu, Notice, SettingsMenu } from './messages';

const button = (id: string, label: string, command: string): ReplyButton => ({
	id,
	label,
	command: `!autotramonta${command ? ` ${command}` : ''}`,
});
const arg = (r: MessageObj) => r.rawCommand?.immediateArg?.trim() || '';
const normalized = (text: string) =>
	text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');

export const startAutoTramontaHandler = () => {
	const store = createAutoStore();
	let settings;
	try {
		settings = store.load();
	} catch {
		console.error(
			'[AutoTramonta] Configuração ausente ou inválida; serviço não iniciado.'
		);
		return;
	}
	let waReady = false;
	let runtime: ReturnType<typeof createModule>;
	let catalog: Array<{ id: string; name: string }> = [];
	let search = '';
	const ask = async (resource: string, data: Record<string, unknown> = {}) => {
		if (!runtime.socket.connected) throw new Error('Gateway indisponível.');
		let eventName: string | undefined;
		const capture = (event: string, payload: { request?: { id?: string } }) => {
			if (event === 'ask_resource' && payload.request?.id)
				eventName = `reply_resource/${payload.request.id}`;
		};
		runtime.socket.onAnyOutgoing(capture);
		const request = runtime.ask.boundary('kozz-zapo', resource, data);
		runtime.socket.offAnyOutgoing(capture);
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const result = await Promise.race([
				request,
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error('ZAPO não respondeu no prazo.')),
						12_000
					);
				}),
			]);
			return result.response;
		} finally {
			if (timer) clearTimeout(timer);
			if (eventName) runtime.socket.removeAllListeners(eventName);
		}
	};
	const allowed = (chatId: string) =>
		!areCommandsDisabledForGroup(chatId) &&
		!isUserMutted({ id: settings.ownerIds[0], aliases: settings.ownerIds }, chatId);
	const engine = new AutoTramontaEngine(settings, {
		persist: store.save,
		ready: () => runtime.socket.connected && waReady,
		allowed,
		generate: async (input, signal) => {
			// History supplies context only. The engine's live cursor alone authorizes a reply.
			const history = await ask('recent_chat_messages', {
				chatId: input.chatId,
				limit: 30,
			});
			if (signal.aborted) throw new Error('Geração cancelada');
			const context = new Map<string, ChatLine>();
			if (Array.isArray(history))
				for (const item of history) {
					// Recheck recent manual activity even if the live event was missed
					// during startup/reconnection. Never treat an automatic echo as human.
					const own = isOwnerMessage(item || {}, engine.config.ownerIds);
					if (own && typeof item.id === 'string')
						engine.ingest({
							id: item.id,
							chatId: input.chatId,
							author: 'Tramonta',
							own: true,
							mentioned: false,
							text:
								item.body ||
								(['IMAGE', 'VIDEO', 'AUDIO', 'STICKER'].includes(item.messageType)
									? '[Enviou mídia]'
									: ''),
							timestamp: item.timestamp,
						});
					if (signal.aborted) return { messages: [] };
					if (
						typeof item?.id !== 'string' ||
						typeof item.body !== 'string' ||
						!item.body.trim() ||
						/^[!./]/.test(item.body.trim()) ||
						!Number.isFinite(item.timestamp)
					)
						continue;
					if (item.contact && isUserMutted(item.contact, input.chatId)) continue;
					context.set(item.id, {
						id: item.id,
						author: own
							? isAutoMessage(item.body)
								? 'Tramonta (automático)'
								: 'Tramonta'
							: String(item.contact?.publicName || 'Participante').slice(0, 80),
						text: stripAutoMarker(item.body).slice(0, 1000),
						timestamp: item.timestamp,
						own,
					});
				}
			for (const line of input.context) context.set(line.id, line);
			return generateAutoReply(
				{
					...input,
					context: [...context.values()]
						.sort((a, b) => a.timestamp - b.timestamp)
						.slice(-40),
				},
				signal
			);
		},
		send: (chatId, text, quoteMessageId) => {
			if (!runtime.socket.connected || !waReady)
				throw new Error('WhatsApp indisponível');
			sendAutoText(runtime.socket, chatId, text, quoteMessageId);
		},
	});
	const menu = (r: MessageObj) =>
		r.reply.withButtons(
			<Menu settings={engine.config} status={engine.status()} model={autoModel()} />,
			{
				buttons: [
					button(
						'toggle',
						engine.config.enabled ? 'Parar' : 'Iniciar',
						engine.config.enabled ? 'parar' : 'iniciar'
					),
					button('groups', 'Grupos', 'grupos'),
					button('settings', 'Ajustes', 'ajustes'),
				],
			}
		);
	const control =
		(fn: (r: MessageObj) => unknown | Promise<unknown>) => async (r: MessageObj) => {
			if (!isSelfControl(r.message, engine.config.ownerIds)) return;
			try {
				return await fn(r);
			} catch (error) {
				return r.reply(
					<Notice
						text={
							error instanceof Error
								? error.message
								: 'Não foi possível concluir a ação.'
						}
					/>
				);
			}
		};
	const configureRange = (key: 'cadence' | 'online' | 'offline', scale: number) =>
		control(r => {
			const values = arg(r).split(/\s+/);
			if (values.length !== 2 || values.some(v => !/^\d+$/.test(v)))
				throw new Error(
					'Informe mínimo e máximo. Exemplo: !autotramonta cadencia 45 120'
				);
			engine.configure({ [key]: values.map(v => Number(v) * scale) as Range });
			return menu(r);
		});
	const showGroup = (r: MessageObj, index: number) => {
		const group = catalog[index];
		if (!group)
			return r.reply(
				<Notice text="Nenhum grupo encontrado. Use !autotramonta grupos ou !autotramonta buscar nome." />
			);
		const selected = engine.config.groups.some(g => g.id === group.id);
		return r.reply.withButtons(
			<GroupCard
				group={group}
				selected={selected}
				index={index}
				count={catalog.length}
				search={search}
			/>,
			{
				buttons: [
					button(
						'select',
						selected ? 'Remover grupo' : 'Adicionar grupo',
						`grupo ${group.id}`
					),
					button('next', 'Próximo grupo', `pagina ${(index + 1) % catalog.length}`),
					button('back', 'Menu', ''),
				],
			}
		);
	};
	const loadGroups = async (r: MessageObj, term: string) => {
		const groups = await ask('all_groups');
		if (!Array.isArray(groups))
			throw new Error('Não foi possível carregar seus grupos. Tente novamente.');
		search = term;
		catalog = groups
			.filter(
				(g): g is { id: string; name: string } =>
					typeof g?.id === 'string' &&
					g.id.endsWith('@g.us') &&
					typeof g.name === 'string' &&
					normalized(g.name).includes(normalized(term))
			)
			.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
		return showGroup(r, 0);
	};
	const onMessage = ({ message: m }: { message: MessageReceivedByGateway }) => {
		if (m.boundaryName !== 'kozz-zapo' || !m.chatId?.endsWith('@g.us')) return;
		const ids = engine.config.ownerIds;
		const own = isOwnerMessage(m, ids);
		if (!own && isUserMutted(m.contact, m.chatId)) return;
		const mentioned =
			m.taggedContacts?.some(c => ids.includes(normalizeId(c.id))) || false;
		engine.ingest({
			id: m.id,
			chatId: m.chatId,
			author: (m.contact.publicName || 'Participante').slice(0, 80),
			text:
				m.body ||
				(m.messageType !== 'OTHER'
					? `[Enviou ${m.messageType.toLowerCase()} sem transcrição]`
					: ''),
			timestamp: m.timestamp,
			mentioned,
			own,
			quoteMessageId: m.quotedMessage?.id,
		});
	};
	runtime = createModule({
		name: 'autotramonta',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		proxy: { source: 'kozz-zapo/*', onMessage },
		commands: {
			boundariesToHandle: ['kozz-zapo'],
			methods: {
				...createMethod('default', control(menu)),
				...createMethod('status', control(menu)),
				...createMethod(
					'iniciar',
					control(r => {
						if (!process.env.FUELIX_API_KEY)
							throw new Error('Provedor de IA não configurado.');
						if (!waReady)
							throw new Error(
								'WhatsApp ainda não está pronto. Tente novamente em alguns segundos.'
							);
						engine.configure({ enabled: true });
						return menu(r);
					})
				),
				...createMethod(
					'parar',
					control(r => {
						engine.configure({ enabled: false });
						return menu(r);
					})
				),
				...createMethod(
					'grupos',
					control(r => loadGroups(r, ''))
				),
				...createMethod(
					'buscar',
					control(r => loadGroups(r, arg(r)))
				),
				...createMethod(
					'pagina',
					control(r => showGroup(r, Number(arg(r))))
				),
				...createMethod(
					'grupo',
					control(async r => {
						const group =
							catalog.find(g => g.id === arg(r)) ||
							engine.config.groups.find(g => g.id === arg(r));
						if (!group)
							throw new Error(
								'Abra !autotramonta grupos e selecione um grupo do menu.'
							);
						const old = engine.config.groups;
						const groups = old.some(g => g.id === group.id)
							? old.filter(g => g.id !== group.id)
							: [...old, group];
						engine.configure({
							groups,
							...(!groups.length ? { enabled: false } : {}),
						});
						return menu(r);
					})
				),
				...createMethod(
					'ajustes',
					control(r =>
						r.reply.withButtons(<SettingsMenu />, {
							buttons: [
								button('cadence', 'Cadência', 'ritmo'),
								button('periods', 'Online/offline', 'periodos'),
								button('mention', 'Menções', 'mencoes'),
							],
						})
					)
				),
				...createMethod(
					'ritmo',
					control(r =>
						r.reply.withButtons(
							<Notice text="Escolha a cadência ou digite !autotramonta cadencia MIN MAX (segundos). Voltar: !autotramonta" />,
							{
								buttons: [
									button('fast', 'Rápida: 15–40s', 'cadencia 15 40'),
									button('normal', 'Normal: 45–120s', 'cadencia 45 120'),
									button('slow', 'Lenta: 120–300s', 'cadencia 120 300'),
								],
							}
						)
					)
				),
				...createMethod(
					'periodos',
					control(r =>
						r.reply.withButtons(
							<Notice text="Escolha a duração das janelas ou use !autotramonta online MIN MAX e !autotramonta offline MIN MAX (minutos)." />,
							{
								buttons: [
									button('online', 'Tempo online', 'janelaonline'),
									button('offline', 'Tempo offline', 'janelaoffline'),
									button('back', 'Menu', ''),
								],
							}
						)
					)
				),
				...createMethod(
					'janelaonline',
					control(r =>
						r.reply.withButtons(
							<Notice text="Períodos online (minutos). Voltar: !autotramonta" />,
							{
								buttons: [
									button('short', 'Curtos: 2–5 min', 'online 2 5'),
									button('normal', 'Normais: 5–15 min', 'online 5 15'),
									button('long', 'Longos: 15–30 min', 'online 15 30'),
								],
							}
						)
					)
				),
				...createMethod(
					'janelaoffline',
					control(r =>
						r.reply.withButtons(
							<Notice text="Períodos offline (minutos). Voltar: !autotramonta" />,
							{
								buttons: [
									button('short', 'Curtos: 5–15 min', 'offline 5 15'),
									button('normal', 'Normais: 15–45 min', 'offline 15 45'),
									button('long', 'Longos: 45–120 min', 'offline 45 120'),
								],
							}
						)
					)
				),
				...createMethod(
					'mencoes',
					control(r =>
						r.reply.withButtons(
							<Notice text="Chance de uma menção despertar o serviço numa pausa automática. Parar manualmente sempre bloqueia. Personalize: !autotramonta chance 35" />,
							{
								buttons: [
									button('never', 'Nunca: 0%', 'chance 0'),
									button('normal', 'Às vezes: 35%', 'chance 35'),
									button('always', 'Sempre: 100%', 'chance 100'),
								],
							}
						)
					)
				),
				...createMethod('cadencia', configureRange('cadence', 1)),
				...createMethod('online', configureRange('online', 60)),
				...createMethod('offline', configureRange('offline', 60)),
				...createMethod(
					'chance',
					control(r => {
						if (!/^\d+$/.test(arg(r)))
							throw new Error('Informe uma chance entre 0 e 100.');
						engine.configure({ mentionChance: Number(arg(r)) });
						return menu(r);
					})
				),
				...createMethod(
					'help',
					control(r => r.reply(<Help />))
				),
				...createMethod(
					'fallback',
					control(r => r.reply(<Help />))
				),
			},
		},
	}).resources.upsertResource('help', () => <Help />);
	let polling = false;
	const pollReady = async () => {
		if (polling || !runtime.socket.connected) return;
		polling = true;
		try {
			const state = (await ask('chat_status')) as
				{ connected?: boolean; registered?: boolean; hasQr?: boolean } | undefined;
			waReady =
				state?.connected === true &&
				state.registered === true &&
				state.hasQr === false;
		} catch {
			waReady = false;
		} finally {
			polling = false;
		}
	};
	runtime.socket.on('disconnect', () => {
		waReady = false;
	});
	runtime.socket.on('introduction_ack', (ack: { success?: boolean }) => {
		if (ack?.success) {
			void pollReady();
			console.info(
				`[AutoTramonta] Registrado; ${engine.config.enabled ? 'iniciado' : 'parado'}, ${engine.config.groups.length} grupos.`
			);
		}
	});
	setInterval(() => {
		void pollReady();
	}, 15_000).unref();
	setInterval(() => {
		void engine.tick().catch(() => console.warn('[AutoTramonta] Falha no ciclo.'));
	}, 1000).unref();
	return runtime;
};
