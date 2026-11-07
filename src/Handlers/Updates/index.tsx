import { createMethod, createModule } from 'kozz-module-maker';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import {
	registerAiContract,
	reportCommandOutcome,
} from '../../Services/OwnerAI/contracts';
import { updateGroups, isUpdateGroupId } from '../../Services/Updates/store';
import { Feedback, Groups, Help } from './messages';

const normalize = (value: string) =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
const input = (r: MessageObj, args: { grupo?: string }) =>
	(args.grupo || r.rawCommand?.immediateArg || '').trim();
const control =
	(fn: (r: MessageObj, args: { grupo?: string }) => unknown) =>
	async (r: MessageObj, args: { grupo?: string }) => {
		const reject = (text: string) => {
			reportCommandOutcome(r.rawCommand, { success: false, error: text });
			return r.reply(<Feedback text={text} />);
		};
		if (
			!r.message.fromHostAccount ||
			r.message.boundaryName !== 'kozz-zapo' ||
			(r.message.namespace && r.message.namespace !== 'default')
		)
			return reject('Apenas o dono do bot pode controlar os grupos de novidades.');
		try {
			return await fn(r, args);
		} catch {
			return reject(
				'Não foi possível concluir. Confira o nome do grupo e tente novamente. Use !updates help para ajuda.'
			);
		}
	};
const complete = (r: MessageObj) =>
	reportCommandOutcome(r.rawCommand, { success: true, status: 'completed' });
const reject = (r: MessageObj, text: string) => {
	reportCommandOutcome(r.rawCommand, { success: false, error: text });
	return r.reply(<Feedback text={text} />);
};
const allGroups = async (r: MessageObj) => {
	const result = await r.ask.boundary(r.message.boundaryId, 'all_groups');
	if (!Array.isArray(result.response)) throw new Error('Grupos indisponíveis.');
	return result.response.filter(
		(g: any) =>
			typeof g?.id === 'string' &&
			isUpdateGroupId(g.id) &&
			typeof g.name === 'string'
	) as { id: string; name: string; groupType?: string }[];
};
const change = (add: boolean) =>
	control(async (r, args) => {
		const term = input(r, args) || r.message.chatId || r.message.to;
		const groups = add ? await allGroups(r) : updateGroups.list();
		const matches = groups.filter(
			g => g.id === term || normalize(g.name) === normalize(term)
		);
		if (matches.length !== 1) {
			if (matches.length > 1)
				await r.reply(
					<Groups
						groups={matches}
						title="Há grupos com o mesmo nome. Escolha um ID:"
					/>
				);
			return reject(
				r,
				matches.length > 1
					? 'Informe o ID do grupo desejado, sem escolher apenas pelo nome.'
					: 'Grupo não encontrado. Use !updates buscar NOME e escolha um grupo; no privado, informe o nome ou ID.'
			);
		}
		const group = matches[0];
		if (add && 'groupType' in group && group.groupType === 'community')
			return reject(
				r,
				'Esse ID é uma comunidade. Escolha seu grupo de conversa ou de avisos com !updates buscar NOME.'
			);
		if (
			add &&
			(!('groupType' in group) ||
				!['group', 'community_group', 'announcement'].includes(
					String(group.groupType)
				))
		)
			return reject(
				r,
				'Não consegui verificar o tipo desse grupo. Tente novamente antes de adicioná-lo.'
			);
		if (add) updateGroups.add(group);
		else updateGroups.remove(group.id);
		complete(r);
		return r.reply(
			<Feedback
				text={`${group.name}: ${add ? 'receberá' : 'deixará de receber'} avisos de novidades nos próximos pushes.`}
			/>
		);
	});

export const startUpdatesHandler = () => {
	registerAiContract('updates', {
		description:
			'Exclusivo do dono: consulta e controla a lista global de grupos que recebem novidades após nossos pushes. Não envia mensagens aos grupos ao configurar.',
		methods: {
			default: {
				syntax: '!updates',
				examples: ['!updates'],
				description: 'Lista os grupos selecionados.',
			},
			listar: { syntax: '!updates listar', examples: ['!updates listar'] },
			buscar: {
				syntax: '!updates buscar NOME',
				examples: ['!updates buscar Sem Juízo'],
				description:
					'Pesquisa grupos por nome e mostra IDs e tipos. Use grupo em namedArgs ou immediateArg.',
			},
			adicionar: {
				syntax: '!updates adicionar [NOME OU ID]',
				examples: ['!updates adicionar'],
				description:
					'Sem alvo, seleciona o grupo atual. Para outro grupo, use grupo em namedArgs ou immediateArg com nome exato ou ID da busca. Nunca invente IDs; homônimos exigem escolha. Recusa comunidades.',
			},
			remover: {
				syntax: '!updates remover [NOME OU ID]',
				examples: ['!updates remover'],
				description:
					'Sem alvo, remove o grupo atual. Para outro grupo, use o nome exato ou ID da lista em grupo ou immediateArg.',
			},
			help: { syntax: '!updates help', examples: ['!updates help'] },
		},
	});
	const list = control(async r => {
		await r.reply(
			<Groups groups={updateGroups.list()} title="Grupos que recebem novidades" />
		);
		complete(r);
	});
	return createModule({
		name: 'updates',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['kozz-zapo'],
			methods: {
				...createMethod('default', list),
				...createMethod('listar', list),
				...createMethod(
					'buscar',
					control(async (r, args) => {
						const term = input(r, args);
						if (!term || term.length > 120)
							return reject(r, 'Escreva o nome a buscar: !updates buscar Sem Juízo');
						const matches = (await allGroups(r)).filter(
							g => normalize(g.name).includes(normalize(term)) || g.id === term
						);
						await r.reply(
							<Groups
								groups={matches.slice(0, 20)}
								title={`Grupos encontrados: ${matches.length}${matches.length > 20 ? ' (primeiros 20; refine a busca)' : ''}`}
							/>
						);
						complete(r);
					}),
					{ grupo: 'string?' }
				),
				...createMethod('adicionar', change(true), { grupo: 'string?' }),
				...createMethod('remover', change(false), { grupo: 'string?' }),
				...createMethod('help', r => r.reply(<Help />)),
				...createMethod('fallback', r => r.reply(<Help />)),
			},
		},
	}).resources.upsertResource('help', () => <Help />);
};
