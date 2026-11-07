import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export class ReminderError extends Error {}
export type Person = { id: string; aliases: string[] };
export type DeliveryState =
	'pending' | 'sending' | 'submitted' | 'failed' | 'uncertain';
export type Reminder = {
	id: string;
	boundary: string;
	chatId: string;
	chatName: string;
	owner: Person;
	text: string;
	due: number;
	created: number;
	recipients: Person[];
	private: boolean;
	status: 'scheduled' | 'dispatching' | 'complete' | 'cancelled';
	localOnly?: boolean;
	deliveries: { chatId: string; kind: 'origin' | 'private'; state: DeliveryState }[];
};
export const contactId = (value: string) => value.replace(/:\d+(?=@)/, '');
export const isPersonId = (value: unknown): value is string =>
	typeof value === 'string' && /^\d+@(lid|s\.whatsapp\.net)$/.test(value);
export const samePerson = (a: Person, b: Person) =>
	a.aliases.some(id => b.aliases.includes(id));
export const consolidatePeople = (people: Person[]) => {
	const result: Person[] = [];
	for (const person of people) {
		const matches = result.filter(other => samePerson(other, person));
		const aliases = [
			...new Set([...person.aliases, ...matches.flatMap(other => other.aliases)]),
		];
		for (const match of matches) result.splice(result.indexOf(match), 1);
		result.push({
			id: aliases.find(id => id.endsWith('@s.whatsapp.net')) || person.id,
			aliases,
		});
	}
	return result;
};
export const parseDuration = (value: string) => {
	const normalized = value.toLowerCase();
	if (!/^(?:\d+(?:s|m|h|d))+$/.test(normalized))
		throw new ReminderError(
			'Informe o tempo: 30s, 10m, 3h, 2d ou 1h30m. Exemplo: !lembrete 3h falar com fulano'
		);
	const units: Record<string, number> = {
		s: 1000,
		m: 60000,
		h: 3600000,
		d: 86400000,
	};
	const duration = [...normalized.matchAll(/(\d+)([smhd])/g)].reduce(
		(sum, m) => sum + Number(m[1]) * units[m[2]],
		0
	);
	if (
		!Number.isSafeInteger(duration) ||
		duration < 10000 ||
		duration > 365 * 86400000
	)
		throw new ReminderError('Use um tempo entre 10 segundos e 365 dias.');
	return duration;
};
export const parseReminder = (query: string) => {
	const firstSpace = query.search(/\s/);
	if (firstSpace < 0)
		throw new ReminderError(
			'Use !lembrete TEMPO texto. Exemplo: !lembrete 3h falar com fulano'
		);
	const duration = parseDuration(query.slice(0, firstSpace));
	const rest = query.slice(firstSpace).trim();
	if (rest.startsWith('--'))
		throw new ReminderError('Escreva o texto do lembrete antes das flags.');
	const parts = rest.split(/\s+--/);
	const text = parts.shift()!.trim();
	if (!text || text.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
		throw new ReminderError('Informe o texto do lembrete, com até 2000 caracteres.');
	let privateMessage = false,
		explicitPeople = false,
		peopleTokens: string[] | undefined;
	const seen = new Set<string>();
	for (const part of parts) {
		const match = /^(privado|pessoas)(?:\s+([\s\S]*))?$/i.exec(part.trim());
		if (!match || seen.has(match[1].toLowerCase()))
			throw new ReminderError(
				'Use apenas --pessoas @Contato @Outro e --privado, uma vez cada.'
			);
		seen.add(match[1].toLowerCase());
		if (match[1].toLowerCase() === 'privado') {
			if (match[2]?.trim())
				throw new ReminderError(
					'A flag --privado não recebe valor. Use !lembrete privado CÓDIGO on/off para alterar depois.'
				);
			privateMessage = true;
		} else {
			if (!match[2]?.trim() || !/^(?:@\d+(?:\s|,|;)*?)+$/.test(match[2].trim()))
				throw new ReminderError(
					'Após --pessoas, marque contatos pelo WhatsApp. Exemplo: --pessoas @Ana @João'
				);
			explicitPeople = true;
			peopleTokens = [...match[2].matchAll(/@(\d+)/g)].map(m => m[1]);
		}
	}
	return { duration, text, private: privateMessage, explicitPeople, peopleTokens };
};
const validPerson = (p: Person) =>
	p &&
	isPersonId(p.id) &&
	Array.isArray(p.aliases) &&
	p.aliases.includes(p.id) &&
	p.aliases.every(isPersonId);
const validChat = (value: unknown): value is string =>
	isPersonId(value) ||
	(typeof value === 'string' && /^\d+(?:-\d+)?@g\.us$/.test(value));
const validReminder = (r: Reminder) =>
	r &&
	/^[a-f0-9]{16}$/.test(r.id) &&
	r.boundary === 'kozz-zapo' &&
	validChat(r.chatId) &&
	typeof r.chatName === 'string' &&
	r.chatName.length <= 120 &&
	validPerson(r.owner) &&
	typeof r.text === 'string' &&
	r.text.length > 0 &&
	r.text.length <= 2000 &&
	Number.isSafeInteger(r.created) &&
	Number.isSafeInteger(r.due) &&
	r.due > r.created &&
	Array.isArray(r.recipients) &&
	r.recipients.length > 0 &&
	r.recipients.length <= 20 &&
	r.recipients.every(validPerson) &&
	new Set(r.recipients.map(p => p.id)).size === r.recipients.length &&
	typeof r.private === 'boolean' &&
	(!r.private || r.chatId.endsWith('@g.us')) &&
	(r.localOnly === undefined ||
		(typeof r.localOnly === 'boolean' && (!r.localOnly || !r.private))) &&
	['scheduled', 'dispatching', 'complete', 'cancelled'].includes(r.status) &&
	Array.isArray(r.deliveries) &&
	r.deliveries.length >= 1 &&
	r.deliveries.length <= 21 &&
	new Set(r.deliveries.map(d => d.chatId)).size === r.deliveries.length &&
	r.deliveries.filter(d => d.kind === 'origin' && d.chatId === r.chatId).length ===
		1 &&
	r.deliveries.every(
		d =>
			validChat(d.chatId) &&
			(d.kind === 'origin'
				? d.chatId === r.chatId
				: d.kind === 'private' &&
					r.private &&
					r.recipients.some(p => p.id === d.chatId)) &&
			['pending', 'sending', 'submitted', 'failed', 'uncertain'].includes(d.state)
	);

export const createReminderStore = (
	directory = path.resolve('.runtime/lembretes')
) => {
	const file = path.join(directory, 'reminders.json');
	let reminders: Reminder[] = [];
	const save = (next: Reminder[]) => {
		fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
		const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
		try {
			fs.writeFileSync(temp, JSON.stringify({ version: 1, reminders: next }), {
				mode: 0o600,
			});
			fs.renameSync(temp, file);
			reminders = next;
		} finally {
			if (fs.existsSync(temp)) fs.unlinkSync(temp);
		}
	};
	if (fs.existsSync(file)) {
		const data = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (
			data.version !== 1 ||
			!Array.isArray(data.reminders) ||
			!data.reminders.every(validReminder)
		)
			throw new Error('Invalid reminders store');
		reminders = data.reminders;
		// A crash can happen after submission but before the ACK is saved locally.
		// Never resend that destination; other pending destinations still proceed.
		if (reminders.some(r => r.deliveries.some(d => d.state === 'sending'))) {
			save(
				reminders.map(r => ({
					...r,
					deliveries: r.deliveries.map(d => ({
						...d,
						state: d.state === 'sending' ? ('uncertain' as const) : d.state,
					})),
				}))
			);
		}
	}
	const put = (r: Reminder) =>
		save([
			...reminders.filter(
				old =>
					old.id !== r.id &&
					(['scheduled', 'dispatching'].includes(old.status) ||
						old.due > Date.now() - 30 * 86400000)
			),
			structuredClone(r),
		]);
	const get = (boundary: string, chatId: string, id: string) => {
		const reminder = reminders.find(
			r =>
				r.boundary === boundary && r.chatId === chatId && r.id === id.toLowerCase()
		);
		if (!reminder)
			throw new ReminderError(
				'Lembrete não encontrado neste chat. Use !lembrete lista.'
			);
		return structuredClone(reminder);
	};
	const editable = (r: Reminder, actor: Person, host: boolean) => {
		if (!host && !samePerson(r.owner, actor))
			throw new ReminderError(
				'Somente quem criou o lembrete ou o dono do bot pode alterar ou cancelar.'
			);
		if (r.status !== 'scheduled')
			throw new ReminderError(
				'Este lembrete já começou a ser enviado, terminou ou foi cancelado.'
			);
	};
	const list = (boundary: string, chatId: string) =>
		structuredClone(
			reminders
				.filter(
					r =>
						r.boundary === boundary &&
						r.chatId === chatId &&
						['scheduled', 'dispatching'].includes(r.status)
				)
				.sort((a, b) => a.due - b.due)
		);
	const plan = (r: Reminder) => {
		r.deliveries = [{ chatId: r.chatId, kind: 'origin', state: 'pending' }];
		if (r.private)
			for (const person of r.recipients) {
				if (!person.aliases.includes(r.chatId))
					r.deliveries.push({
						chatId: person.id,
						kind: 'private',
						state: 'pending',
					});
			}
	};
	return {
		get,
		list,
		put,
		due: (now = Date.now()) =>
			structuredClone(
				reminders
					.filter(
						r => ['scheduled', 'dispatching'].includes(r.status) && r.due <= now
					)
					.sort((a, b) => a.due - b.due)
			),
		create: (args: Omit<Reminder, 'id' | 'status' | 'deliveries'>) => {
			if (
				list(args.boundary, args.chatId).length >= 50 ||
				reminders.filter(r => ['scheduled', 'dispatching'].includes(r.status))
					.length >= 1000
			)
				throw new ReminderError(
					'A agenda está cheia. Cancele um lembrete pendente antes de criar outro.'
				);
			const r: Reminder = {
				...args,
				id: randomBytes(8).toString('hex'),
				status: 'scheduled',
				deliveries: [],
			};
			plan(r);
			if (!validReminder(r)) throw new ReminderError('Dados do lembrete inválidos.');
			put(r);
			return structuredClone(r);
		},
		change: (
			boundary: string,
			chatId: string,
			id: string,
			actor: Person,
			host: boolean,
			patch: {
				recipients?: Person[];
				private?: boolean;
				cancel?: boolean;
				localOnly?: boolean;
			}
		) => {
			const r = get(boundary, chatId, id);
			editable(r, actor, host);
			if (r.localOnly && patch.private === true)
				throw new ReminderError(
					'Este lembrete foi criado pela IA para ficar somente neste chat.'
				);
			if (patch.cancel) r.status = 'cancelled';
			else {
				Object.assign(r, patch);
				plan(r);
			}
			if (!validReminder(r))
				throw new ReminderError(
					'Lista de pessoas inválida. Marque de 1 a 20 participantes.'
				);
			put(r);
			return r;
		},
	};
};
export type ReminderStore = ReturnType<typeof createReminderStore>;
