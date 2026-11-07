import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AiToolInputError } from '../OwnerAI/contracts';

export type MemoryScope = { namespace: string; boundary: string; chatId: string };
export type MemorySubject = {
	type: 'person' | 'group';
	id: string;
	name: string;
	aliases: string[];
};
export type MemoryActor = { id: string; aliases: string[]; host: boolean };
export type MemorySource = {
	messageId: string;
	authorId: string;
	excerpt: string;
	sentAt: number | null;
};
export type Memory = {
	id: string;
	subjectType: 'person' | 'group';
	subjectId: string;
	subjectName: string;
	aliases: string[];
	topic: string;
	text: string;
	revision: number;
	createdAt: number;
	updatedAt: number;
	createdBy: string;
	source: MemorySource;
	attribution: 'self_reported' | 'reported' | 'group';
};
export const normalizeMemoryText = (text: string) =>
	text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
const fail = (message: string): never => {
	throw new AiToolInputError(message);
};
const fingerprint = (text: string) =>
	createHash('sha256').update(normalizeMemoryText(text)).digest('hex');
const cleanText = (text: string) => {
	if (
		typeof text !== 'string' ||
		!text.trim() ||
		text.length > 800 ||
		/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)
	)
		fail('Escreva uma memória curta, de 1 a 800 caracteres.');
	return text.trim();
};
const decode = (row: any): Memory => ({
	id: row.id,
	subjectType: row.subject_type,
	subjectId: row.subject_id,
	subjectName: row.subject_name,
	aliases: JSON.parse(row.subject_aliases),
	topic: row.topic,
	text: row.content,
	revision: row.revision,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	createdBy: row.created_by,
	source: {
		messageId: row.source_message_id,
		authorId: row.source_author_id,
		excerpt: row.source_excerpt,
		sentAt: row.source_timestamp,
	},
	attribution: row.attribution,
});
export const canChangeMemory = (memory: Memory, actor: MemoryActor) =>
	actor.host ||
	memory.subjectType === 'group' ||
	actor.aliases.includes(memory.createdBy) ||
	memory.aliases.some(id => actor.aliases.includes(id));
const scopeParams = (scope: MemoryScope) => [
	scope.namespace,
	scope.boundary,
	scope.chatId,
];

export const createMemoryStore = (file: string) => {
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const fd = fs.openSync(file, 'a', 0o600);
	fs.closeSync(fd);
	fs.chmodSync(file, 0o600);
	const db = new DatabaseSync(file);
	try {
		db.exec(
			'PRAGMA busy_timeout=3000; PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE;'
		);
		const version = Number(
			(db.prepare('PRAGMA user_version').get() as any).user_version
		);
		if (version !== 0 && version !== 1)
			throw new Error('Unsupported memory database');
		if (version === 0) {
			if (
				db
					.prepare(
						"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
					)
					.all().length
			)
				throw new Error('Unknown memory database');
			db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE memories (
     id TEXT PRIMARY KEY, namespace TEXT NOT NULL, boundary TEXT NOT NULL, chat_id TEXT NOT NULL,
     subject_type TEXT NOT NULL CHECK(subject_type IN ('person','group')), subject_id TEXT NOT NULL,
     subject_name TEXT NOT NULL, subject_aliases TEXT NOT NULL CHECK(json_valid(subject_aliases)), topic TEXT NOT NULL,
     content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 800), normalized TEXT NOT NULL, search_text TEXT NOT NULL,
     revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
     created_by TEXT NOT NULL, updated_by TEXT NOT NULL, source_message_id TEXT NOT NULL,
     source_author_id TEXT NOT NULL, source_excerpt TEXT NOT NULL, source_timestamp INTEGER, attribution TEXT NOT NULL,
     UNIQUE(namespace,boundary,chat_id,subject_type,subject_id,topic)
    );
    CREATE INDEX memories_chat ON memories(namespace,boundary,chat_id,updated_at DESC);
    CREATE TABLE memory_tombstones (
     namespace TEXT NOT NULL,boundary TEXT NOT NULL,chat_id TEXT NOT NULL,subject_type TEXT NOT NULL,
     subject_aliases TEXT NOT NULL,topic TEXT NOT NULL,text_hash TEXT NOT NULL,source_message_id TEXT NOT NULL,deleted_at INTEGER NOT NULL
    );
    CREATE INDEX tombstones_chat ON memory_tombstones(namespace,boundary,chat_id);
    PRAGMA user_version=1; COMMIT;`);
		}
	} catch (error) {
		db.close();
		throw error;
	}
	const scoped = 'namespace=? AND boundary=? AND chat_id=?';
	const get = (scope: MemoryScope, id: string) => {
		if (typeof id !== 'string' || !/^[a-f0-9]{16}$/.test(id))
			fail('Use o código de uma memória retornada pela consulta.');
		const row = db
			.prepare(`SELECT * FROM memories WHERE ${scoped} AND id=?`)
			.get(...scopeParams(scope), id);
		return row ? decode(row) : fail('Memória não encontrada neste chat.');
	};
	const transaction = <T>(fn: () => T): T => {
		db.exec('BEGIN IMMEDIATE');
		try {
			const value = fn();
			db.exec('COMMIT');
			return value;
		} catch (error) {
			db.exec('ROLLBACK');
			throw error;
		}
	};
	const search = (
		scope: MemoryScope,
		args: {
			query?: string;
			type?: string;
			aliases?: string[];
			limit?: number;
			offset?: number;
		} = {}
	) => {
		const limit = args.limit ?? 10,
			offset = args.offset ?? 0;
		if (
			!Number.isInteger(limit) ||
			limit < 1 ||
			limit > 20 ||
			!Number.isInteger(offset) ||
			offset < 0 ||
			offset > 1000
		)
			fail('Consulte de 1 a 20 memórias por página.');
		const clauses = [scoped],
			params: (string | number)[] = scopeParams(scope);
		if (args.type && args.type !== 'all') {
			clauses.push('subject_type=?');
			params.push(args.type);
		}
		if (args.aliases?.length) {
			clauses.push(
				`EXISTS(SELECT 1 FROM json_each(subject_aliases) WHERE value IN (${args.aliases.map(() => '?').join(',')}))`
			);
			params.push(...args.aliases);
		}
		const terms =
			normalizeMemoryText(args.query || '')
				.match(/[\p{L}\p{N}]+/gu)
				?.filter(
					term =>
						term.length > 2 &&
						![
							'para',
							'como',
							'sobre',
							'qual',
							'quais',
							'voce',
							'voces',
							'esse',
							'essa',
							'isso',
							'aqui',
							'lembra',
							'memoria',
							'memorias',
						].includes(term)
				)
				.slice(0, 8) || [];
		if (terms.length) {
			clauses.push('(' + terms.map(() => 'search_text LIKE ?').join(' OR ') + ')');
			params.push(...terms.map(term => `%${term}%`));
		}
		const where = clauses.join(' AND ');
		const total = Number(
			(
				db
					.prepare(`SELECT COUNT(*) AS n FROM memories WHERE ${where}`)
					.get(...params) as any
			).n
		);
		const rows = db
			.prepare(
				`SELECT * FROM memories WHERE ${where} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?`
			)
			.all(...params, limit, offset);
		return {
			memories: rows.map(decode),
			total,
			nextOffset: offset + rows.length < total ? offset + rows.length : null,
		};
	};
	const create = (
		scope: MemoryScope,
		subject: MemorySubject,
		topic: string,
		text: string,
		source: MemorySource,
		actor: MemoryActor
	) =>
		transaction(() => {
			const content = cleanText(text);
			if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(topic))
				fail('Use um tópico curto, como comida.preferida ou encontro.local.');
			const forgotten = db
				.prepare(
					`SELECT source_message_id,deleted_at FROM memory_tombstones WHERE ${scoped} AND subject_type=? AND EXISTS(SELECT 1 FROM json_each(subject_aliases) WHERE value IN (${subject.aliases.map(() => '?').join(',')})) AND (topic=? OR text_hash=?)`
				)
				.all(
					...scopeParams(scope),
					subject.type,
					...subject.aliases,
					topic,
					fingerprint(content)
				);
			if (
				forgotten.some(
					row =>
						row.source_message_id === source.messageId ||
						!source.sentAt ||
						source.sentAt <= Number(row.deleted_at)
				)
			)
				fail(
					'Essa informação foi esquecida. Não a recupere de mensagens antigas; só uma nova declaração posterior pode fundamentar outra memória.'
				);
			const existing = search(scope, {
				type: subject.type,
				aliases: subject.aliases,
				limit: 20,
			});
			// Check all matching aliases, rather than relying only on the preferred PN/LID.
			const rows = db
				.prepare(
					`SELECT * FROM memories WHERE ${scoped} AND subject_type=? AND EXISTS(SELECT 1 FROM json_each(subject_aliases) WHERE value IN (${subject.aliases.map(() => '?').join(',')})) AND (topic=? OR normalized=?)`
				)
				.all(
					...scopeParams(scope),
					subject.type,
					...subject.aliases,
					topic,
					normalizeMemoryText(content)
				);
			if (rows.length) {
				const memory = decode(rows[0]);
				if (normalizeMemoryText(memory.text) === normalizeMemoryText(content))
					return { memory, created: false };
				fail(
					`Já existe uma memória nesse tópico. Consulte e use atualizar com o código e revisão atuais: ${memory.id}.`
				);
			}
			const globalCount = Number(
				(db.prepare('SELECT COUNT(*) AS n FROM memories').get() as any).n
			);
			if (
				search(scope, { limit: 1 }).total >= 1000 ||
				globalCount >= 50000 ||
				existing.total >= 100
			)
				fail(
					'A memória está cheia. Remova informações antigas antes de acrescentar outras.'
				);
			const id = randomBytes(8).toString('hex'),
				now = Date.now();
			const attribution =
				subject.type === 'group'
					? 'group'
					: subject.aliases.includes(source.authorId)
						? 'self_reported'
						: 'reported';
			db.prepare(
				`INSERT INTO memories VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
			).run(
				id,
				...scopeParams(scope),
				subject.type,
				subject.id,
				subject.name,
				JSON.stringify(subject.aliases),
				topic,
				content,
				normalizeMemoryText(content),
				normalizeMemoryText(`${subject.name} ${topic} ${content}`),
				1,
				now,
				now,
				actor.id,
				actor.id,
				source.messageId,
				source.authorId,
				source.excerpt.slice(0, 400),
				source.sentAt,
				attribution
			);
			return { memory: get(scope, id), created: true };
		});
	const update = (
		scope: MemoryScope,
		id: string,
		revision: number,
		text: string,
		source: MemorySource,
		actor: MemoryActor
	) =>
		transaction(() => {
			const memory = get(scope, id),
				content = cleanText(text);
			if (!canChangeMemory(memory, actor))
				fail(
					'Somente a própria pessoa, quem registrou ou o dono do bot pode corrigir esta memória pessoal.'
				);
			if (memory.revision !== revision)
				fail('A memória mudou. Consulte de novo antes de corrigir.');
			db.prepare(
				`UPDATE memories SET content=?,normalized=?,search_text=?,revision=revision+1,updated_at=?,updated_by=?,source_message_id=?,source_author_id=?,source_excerpt=?,source_timestamp=?,attribution=? WHERE ${scoped} AND id=? AND revision=?`
			).run(
				content,
				normalizeMemoryText(content),
				normalizeMemoryText(`${memory.subjectName} ${memory.topic} ${content}`),
				Date.now(),
				actor.id,
				source.messageId,
				source.authorId,
				source.excerpt.slice(0, 400),
				source.sentAt,
				memory.subjectType === 'group'
					? 'group'
					: memory.aliases.includes(source.authorId)
						? 'self_reported'
						: 'reported',
				...scopeParams(scope),
				id,
				revision
			);
			return get(scope, id);
		});
	const remove = (
		scope: MemoryScope,
		id: string,
		revision: number,
		actor: MemoryActor
	) =>
		transaction(() => {
			const memory = get(scope, id);
			if (!canChangeMemory(memory, actor))
				fail(
					'Somente a própria pessoa, quem registrou ou o dono do bot pode apagar esta memória pessoal.'
				);
			if (memory.revision !== revision)
				fail('A memória mudou. Consulte de novo antes de apagar.');
			db.prepare('INSERT INTO memory_tombstones VALUES (?,?,?,?,?,?,?,?,?)').run(
				...scopeParams(scope),
				memory.subjectType,
				JSON.stringify(memory.aliases),
				memory.topic,
				fingerprint(memory.text),
				memory.source.messageId,
				Date.now()
			);
			db.prepare(`DELETE FROM memories WHERE ${scoped} AND id=? AND revision=?`).run(
				...scopeParams(scope),
				id,
				revision
			);
			return { deleted: true, id };
		});
	return { get, search, create, update, remove, close: () => db.close() };
};
export type MemoryStore = ReturnType<typeof createMemoryStore>;
const stores = new Map<string, MemoryStore>();
export const defaultMemoryPath = () =>
	path.resolve('.runtime/ai-memory/memory.sqlite');
export const memoryStore = () => {
	const file = defaultMemoryPath();
	if (!stores.has(file)) stores.set(file, createMemoryStore(file));
	return stores.get(file)!;
};
export const closeMemoryStores = () => {
	for (const store of stores.values()) store.close();
	stores.clear();
};
