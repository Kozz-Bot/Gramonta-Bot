import { createMethod, createModule } from 'kozz-module-maker';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import { botBans, normalizeBanId } from '../../Services/Bans/store';
import { resolveMuteContact } from '../../Proxies/Mute/context';
import {
	registerAiContract,
	reportCommandOutcome,
} from '../../Services/OwnerAI/contracts';
import { BanEntry, BanListHeader, Changed, Feedback, Help } from './messages';

type Args = { reason?: string; targetId?: string };
const changeBan = (action: 'ban' | 'unban') => async (r: MessageObj, args: Args) => {
	const reject = (error: string) => {
		reportCommandOutcome(r.rawCommand, { success: false, error });
		return r.reply(<Feedback text={error} />);
	};
	if (!r.message.fromHostAccount)
		return reject('Apenas o dono do bot pode banir ou liberar o acesso.');
	const reason = args.reason?.trim();
	if (action === 'ban' && (!reason || reason.length > 2000))
		return reject(
			'Informe o motivo (até 2000 caracteres): !ban @Pessoa --reason Motivo'
		);
	const tagged = r.message.taggedContacts ?? [];
	if ((args.targetId && tagged.length) || tagged.length > 1)
		return reject(
			'Selecione uma única pessoa: use uma marcação ou --targetId, sem misturar.'
		);
	const target = args.targetId ? { id: args.targetId } : tagged[0];
	if (!target)
		return reject(
			'Marque a pessoa: !ban @Pessoa --reason Motivo ou !unban @Pessoa.'
		);
	let id: string;
	try {
		id = normalizeBanId(target.id);
	} catch {
		return reject('Informe um número com país e DDD ou selecione um contato com @.');
	}
	let contact;
	try {
		contact = await resolveMuteContact(r, { ...target, id });
	} catch {
		return reject(
			'Não foi possível verificar o contato no WhatsApp. Tente novamente.'
		);
	}
	const ids = [contact.id, ...(contact.aliases ?? [])].map(normalizeBanId);
	if (
		action === 'ban' &&
		ids.some(value => [r.message.from, r.message.contact.id].includes(value))
	)
		return reject('O dono do bot não pode banir o próprio acesso.');
	if (action === 'ban') botBans.ban(id, ids, reason!);
	else {
		if (!botBans.isBanned(ids)) return reject('Essa pessoa não está banida do bot.');
		// The stored record may be keyed by either verified address.
		for (const value of ids) botBans.unban(value);
	}
	reportCommandOutcome(r.rawCommand, { success: true, status: 'completed' });
	return r.reply(<Changed id={id} reason={action === 'ban' ? reason : undefined} />);
};

export const startBanHandler = () => {
	registerAiContract('ban', {
		description:
			'Dono do bot: banimento global permanente por pessoa, com motivo salvo; permite revogar.',
		methods: {
			list: {
				syntax: '!banlist',
				examples: ['!banlist'],
				description:
					'Lista os banimentos atuais, com contato, motivo e data. Exclusivo do dono. Sem argumentos.',
			},
			default: {
				syntax: '!ban @Pessoa --reason MOTIVO (ou --targetId NÚMERO)',
				examples: ['!ban @Pessoa --reason Desrespeito às regras'],
				description:
					'Use namedArgs com reason e targetId (número/JID verificado), ou recipientIds com uma pessoa marcada. Exclusivo do dono.',
			},
			unban: {
				syntax: '!unban @Pessoa (ou --targetId NÚMERO)',
				examples: ['!unban @Pessoa'],
				description:
					'Revoga o banimento global. Use targetId ou uma marcação. Exclusivo do dono.',
			},
		},
	});
	return createModule({
		name: 'ban',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...createMethod('list', async r => {
					if (!r.message.fromHostAccount) {
						const error = 'Apenas o dono do bot pode consultar os banimentos.';
						reportCommandOutcome(r.rawCommand, { success: false, error });
						return r.reply(<Feedback text={error} />);
					}
					const bans = botBans.list();
					await r.reply(<BanListHeader count={bans.length} />);
					for (const ban of bans) await r.reply(<BanEntry ban={ban} />);
					reportCommandOutcome(r.rawCommand, { success: true, status: 'completed' });
				}),
				...createMethod('default', changeBan('ban'), {
					reason: 'string?',
					targetId: 'string?',
				}),
				...createMethod('unban', changeBan('unban'), { targetId: 'string?' }),
				...createMethod('help', r => r.reply(<Help />)),
				...createMethod('fallback', r => r.reply(<Help />)),
			},
			aliases: [
				{ name: 'unban', target: { method: 'unban' } },
				{ name: 'banlist', target: { method: 'list' } },
			],
		},
	}).resources.upsertResource('help', () => <Help />);
};
