import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { ReplyButton } from 'kozz-types';
import { isSelfControl } from '../../Services/AutoTramonta/engine';
import { createAutoStore } from '../../Services/AutoTramonta/store';
import { PeriodicGroup, periodicGroups } from '../../Services/PeriodicStatus/groups';
import { Agenda, GroupCard, Help, Menu, Notice } from './messages';

const arg = (r: MessageObj) => r.rawCommand?.immediateArg?.trim() || '';
const normalized = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
const button = (id: string, label: string, command: string): ReplyButton => ({
	id,
	label,
	command: `!autostatus${command ? ` ${command}` : ''}`,
});

export const startAutoStatusHandler = () => {
	let ownerIds: string[];
	try {
		ownerIds = createAutoStore().load().ownerIds;
		periodicGroups.load();
	} catch {
		console.error(
			'[AutoStatus] Configuração de grupos ou proprietário inválida; controle não iniciado.'
		);
		return;
	}
	let runtime: ReturnType<typeof createModule>;
	let catalog: PeriodicGroup[] = [];
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

	const menu = (r: MessageObj) => {
		const settings = periodicGroups.load();
		return r.reply.withButtons(<Menu settings={settings} />, {
			buttons: [
				button(
					'toggle',
					settings.enabled ? 'Parar grupos' : 'Iniciar grupos',
					settings.enabled ? 'parar' : 'iniciar'
				),
				button('groups', 'Grupos', 'grupos'),
				button('agenda', 'Agenda', 'agenda'),
			],
		});
	};
	const control =
		(fn: (r: MessageObj) => unknown | Promise<unknown>) => async (r: MessageObj) => {
			if (!isSelfControl(r.message, ownerIds)) return;
			try {
				return await fn(r);
			} catch {
				return r.reply(
					<Notice text="Não foi possível concluir. Confira o comando ou tente novamente. Use !autostatus help para ajuda." />
				);
			}
		};
	const showGroup = (r: MessageObj, index: number) => {
		if (!Number.isInteger(index) || index < 0 || index >= catalog.length)
			return r.reply(
				<Notice text="Nenhum grupo nessa página. Use !autostatus grupos, buscar nome ou selecionados." />
			);
		const group = catalog[index];
		const selected = periodicGroups.load().groups.some(g => g.id === group.id);
		return r.reply.withButtons(
			<GroupCard
				group={group}
				selected={selected}
				index={index}
				count={catalog.length}
			/>,
			{
				buttons: [
					button(
						'select',
						selected ? 'Remover grupo' : 'Adicionar grupo',
						`${selected ? 'remover' : 'adicionar'} ${group.id}`
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
			return r.reply(
				<Notice text="Não foi possível carregar os grupos. Tente novamente." />
			);
		catalog = groups
			.filter(
				(g): g is PeriodicGroup =>
					typeof g?.id === 'string' &&
					/^\d+(?:-\d+)?@g\.us$/.test(g.id) &&
					typeof g.name === 'string' &&
					normalized(g.name).includes(normalized(term))
			)
			.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
		return showGroup(r, 0);
	};
	const select = (add: boolean) =>
		control(async r => {
			const id = arg(r);
			const settings = periodicGroups.load();
			if (add) {
				// Revalidate membership even for an old button or an explicitly typed ID.
				const groups = await ask('all_groups');
				const group = Array.isArray(groups)
					? groups.find(
							g =>
								g?.id === id &&
								/^\d+(?:-\d+)?@g\.us$/.test(g.id) &&
								typeof g.name === 'string'
						)
					: undefined;
				if (!group)
					return r.reply(
						<Notice text="Grupo indisponível. Abra !autostatus grupos e selecione um grupo atual." />
					);
				// Read again after the async lookup to preserve any intervening configuration change.
				const latest = periodicGroups.load();
				if (!latest.groups.some(g => g.id === id))
					periodicGroups.save({
						...latest,
						groups: [...latest.groups, { id: group.id, name: group.name }],
					});
			} else {
				const groups = settings.groups.filter(g => g.id !== id);
				periodicGroups.save({
					...settings,
					groups,
					enabled: settings.enabled && groups.length > 0,
				});
			}
			return menu(r);
		});
	runtime = createModule({
		name: 'autostatus',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['kozz-zapo'],
			methods: {
				...createMethod('default', control(menu)),
				...createMethod('status', control(menu)),
				...createMethod(
					'iniciar',
					control(r => {
						const settings = periodicGroups.load();
						if (!settings.groups.length)
							return r.reply(
								<Notice text="Selecione pelo menos um grupo com !autostatus grupos antes de iniciar." />
							);
						periodicGroups.save({ ...settings, enabled: true });
						return menu(r);
					})
				),
				...createMethod(
					'parar',
					control(r => {
						periodicGroups.save({ ...periodicGroups.load(), enabled: false });
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
					'selecionados',
					control(r => {
						catalog = periodicGroups.load().groups;
						return showGroup(r, 0);
					})
				),
				...createMethod(
					'pagina',
					control(r =>
						/^\d+$/.test(arg(r))
							? showGroup(r, Number(arg(r)))
							: r.reply(
									<Notice text="Use !autostatus pagina NUMERO ou !autostatus grupos." />
								)
					)
				),
				...createMethod('adicionar', select(true)),
				...createMethod('remover', select(false)),
				...createMethod(
					'agenda',
					control(r => r.reply(<Agenda />))
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
	return runtime;
};
