import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const TIME_ZONE = 'America/Sao_Paulo';
export class RoleError extends Error {}
export type Person = { id: string; aliases: string[] };
export type RoleEvent = {
	id: string;
	boundaryId: string;
	chatId: string;
	owner: Person;
	title: string;
	location: string;
	start: number;
	end: number;
	created: number;
	updated: number;
	revision: number;
	cancelled: boolean;
	nativeState?: 'submitted' | 'uncertain';
	// Legacy fields remain readable and are preserved when older records are edited.
	reminderSent?: boolean;
	votes?: unknown[];
};
export const samePerson = (a: Person, b: Person) =>
	a.aliases.some(id => b.aliases.includes(id));
export const formatDate = (timestamp: number) =>
	new Intl.DateTimeFormat('pt-BR', {
		timeZone: TIME_ZONE,
		dateStyle: 'short',
		timeStyle: 'short',
	}).format(timestamp);

export const parseEvent = (input: string, now = Date.now()) => {
	const parts = input.split('|').map(s => s.trim());
	if (parts.length !== 3)
		throw new RoleError(
			'Use !evento Título | DD/MM/AAAA HHhMM | Local. Exemplo: !evento Churrasco | 07/11/2026 14h | Casa do João'
		);
	const [title, date, location] = parts;
	if (
		!title ||
		title.length > 120 ||
		!location ||
		location.length > 250 ||
		/[\r\n\x00-\x1f]/.test(title + location)
	)
		throw new RoleError(
			'Informe um título de até 120 caracteres e um local de até 250, em uma única linha.'
		);
	const m =
		/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?:\s*-\s*(\d{1,2})(?:h(\d{2})?|:(\d{2})))?$/i.exec(
			date
		);
	if (!m)
		throw new RoleError(
			'Informe a data completa e o horário de Brasília: 07/11/2026 14h ou 07/11/2026 14:00-18:00.'
		);
	const [, d, mo, y, h, mi, mic, eh, em, emc] = m;
	const year = +y,
		month = +mo,
		day = +d,
		hour = +h,
		minute = +(mi || mic || 0);
	const wall = Date.UTC(year, month - 1, day, hour, minute);
	const check = new Date(wall);
	if (
		year < 2026 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		check.getUTCDate() !== day ||
		hour > 23 ||
		minute > 59
	)
		throw new RoleError('Data ou horário inválido. Confira o dia, o mês e a hora.');
	// Resolve wall time through IANA rather than assuming a fixed offset.
	let start = wall;
	const formatter = new Intl.DateTimeFormat('en-GB', {
		timeZone: TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	});
	for (let i = 0; i < 3; i++) {
		const p = formatter.formatToParts(start);
		const n = (type: string) => Number(p.find(v => v.type === type)?.value);
		start +=
			wall - Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
	}
	if (start <= now || start > now + 366 * 86400000)
		throw new RoleError('Escolha uma data futura, dentro dos próximos 366 dias.');
	let duration = 120;
	if (eh !== undefined) {
		const endHour = +eh,
			endMinute = +(em || emc || 0);
		if (endHour > 23 || endMinute > 59)
			throw new RoleError('Horário de término inválido.');
		duration = endHour * 60 + endMinute - (hour * 60 + minute);
		if (duration <= 0) duration += 1440;
	}
	return { title, location, start, end: start + duration * 60000 };
};

export const createRoleStore = (directory = path.resolve('.runtime/role')) => {
	const file = path.join(directory, 'events.json');
	let events: RoleEvent[] = [];
	if (fs.existsSync(file)) {
		const data = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (
			data.version !== 1 ||
			!Array.isArray(data.events) ||
			!data.events.every(
				(e: RoleEvent) =>
					/^[a-f0-9]{10}$/.test(e.id) &&
					typeof e.chatId === 'string' &&
					e.chatId.endsWith('@g.us') &&
					typeof e.boundaryId === 'string' &&
					typeof e.title === 'string' &&
					typeof e.location === 'string' &&
					Number.isFinite(e.start) &&
					Number.isFinite(e.end) &&
					e.end > e.start &&
					Number.isFinite(e.created) &&
					Number.isFinite(e.updated) &&
					Number.isInteger(e.revision) &&
					typeof e.cancelled === 'boolean' &&
					validPerson(e.owner)
			)
		)
			throw new Error('Dados de rolês inválidos');
		events = data.events;
	}
	const save = (next: RoleEvent[]) => {
		fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
		const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
		try {
			fs.writeFileSync(temp, JSON.stringify({ version: 1, events: next }), {
				mode: 0o600,
			});
			fs.renameSync(temp, file);
			events = next;
		} finally {
			if (fs.existsSync(temp)) fs.unlinkSync(temp);
		}
	};
	const list = (boundaryId: string, chatId: string, now = Date.now()) =>
		structuredClone(
			events
				.filter(
					e =>
						e.boundaryId === boundaryId &&
						e.chatId === chatId &&
						!e.cancelled &&
						e.end > now
				)
				.sort((a, b) => a.start - b.start)
		);
	const get = (boundaryId: string, chatId: string, id: string) => {
		const e = events.find(
			e =>
				e.boundaryId === boundaryId &&
				e.chatId === chatId &&
				e.id === id.toLowerCase()
		);
		if (!e)
			throw new RoleError(
				'Rolê não encontrado neste grupo. Use !evento lista para ver os códigos.'
			);
		return structuredClone(e);
	};
	const put = (event: RoleEvent) =>
		save([
			...events.filter(e => e.id !== event.id && e.end > Date.now() - 90 * 86400000),
			structuredClone(event),
		]);
	return {
		list,
		get,
		put,
		create: (
			boundaryId: string,
			chatId: string,
			owner: Person,
			input: string,
			now = Date.now()
		) => {
			if (list(boundaryId, chatId, now).length >= 20)
				throw new RoleError(
					'O grupo já tem 20 rolês ativos. Cancele um antes de criar outro.'
				);
			const e: RoleEvent = {
				...parseEvent(input, now),
				id: randomBytes(5).toString('hex'),
				boundaryId,
				chatId,
				owner,
				created: now,
				updated: now,
				revision: 0,
				cancelled: false,
			};
			put(e);
			return e;
		},
	};
};
function validPerson(p: Person) {
	return (
		p &&
		typeof p.id === 'string' &&
		Array.isArray(p.aliases) &&
		p.aliases.includes(p.id) &&
		p.aliases.every(id => typeof id === 'string')
	);
}

export const edit = (
	e: RoleEvent,
	person: Person,
	host: boolean,
	input?: string,
	now = Date.now()
) => {
	if (!host && !samePerson(e.owner, person))
		throw new RoleError(
			'Somente quem criou o rolê ou o dono do bot pode editar ou cancelar.'
		);
	if (e.cancelled || e.start <= now)
		throw new RoleError('Este rolê foi cancelado ou já começou.');
	if (input !== undefined) Object.assign(e, parseEvent(input, now));
	else e.cancelled = true;
	e.updated = now;
	e.revision++;
	return e;
};
