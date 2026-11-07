import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { localDateTime } from '../PeriodicStatus/scheduler';
import type { CurrentTheme, NewsDraft, NewsIdea, NewsResult } from './content';

// Identificado por movimento em 2026-10-27: 6.243 mensagens nos últimos sete dias.
export const GROUP_ID = '120363145764693476@g.us';
export const TIMES = ['10:30', '19:00'] as const;
export type Ask = (
	resource: string,
	payload?: Record<string, unknown>
) => Promise<unknown>;
type RecordState = {
	attempts: number;
	draft?: NewsDraft;
	subjectUpdated?: boolean;
	pictureUpdated?: boolean;
	currentTheme?: CurrentTheme;
	skippedReason?: string;
	skippedIdea?: NewsIdea;
};

export const createNewsRunner = (options: {
	directory: string;
	ask: Ask;
	generate: (
		date: string,
		previousSubjects: string[],
		current: CurrentTheme
	) => Promise<NewsResult>;
	now?: () => Date;
}) => {
	const now = options.now || (() => new Date());
	let busy = false;
	const load = async (file: string): Promise<RecordState> => {
		try {
			return JSON.parse(await readFile(file, 'utf8'));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { attempts: 0 };
			throw error;
		}
	};
	const save = async (file: string, state: RecordState) => {
		await writeFile(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
		await rename(`${file}.tmp`, file);
	};
	return async () => {
		if (busy) return;
		busy = true;
		try {
			const local = localDateTime(now());
			const time = TIMES.find(time => {
				const [hour, minute] = time.split(':').map(Number);
				const elapsed = local.minute - hour * 60 - minute;
				return elapsed >= 0 && elapsed < 15;
			});
			if (!time) return;
			await mkdir(options.directory, { recursive: true, mode: 0o700 });
			const file = path.join(
				options.directory,
				`${local.date}-${time.replace(':', '')}.json`
			);
			const state = await load(file);
			if (state.pictureUpdated || state.skippedReason || state.attempts >= 3) return;
			const status = (await options.ask('chat_status')) as
				{ connected?: boolean; registered?: boolean; hasQr?: boolean } | undefined;
			if (!status?.connected || !status.registered || status.hasQr !== false) return;
			state.attempts++;
			await save(file, state);
			if (!state.draft) {
				const group = (await options.ask('group_chat_info', {
					chatId: GROUP_ID,
				})) as { id?: string; name?: string } | undefined;
				if (
					group?.id !== GROUP_ID ||
					typeof group.name !== 'string' ||
					!group.name.trim()
				)
					throw new Error('Nome atual do grupo indisponível; grupo preservado');
				const currentTheme: CurrentTheme = { subject: group.name };
				const previous: string[] = [];
				for (const name of (await readdir(options.directory))
					.filter(name => /^\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(name))
					.sort()
					.reverse()) {
					const old = await load(path.join(options.directory, name));
					if (old.draft && previous.length < 8) previous.unshift(old.draft.subject);
					if (
						!currentTheme.headline &&
						old.subjectUpdated &&
						old.draft?.subject === group.name
					)
						currentTheme.headline = old.draft.headline;
				}
				state.currentTheme = currentTheme;
				const result = await options.generate(local.date, previous, currentTheme);
				if ('skipped' in result) {
					state.skippedReason = result.reason;
					state.skippedIdea = result.idea;
					await save(file, state);
					console.info(
						`[BaguncinhaNews] Tema atual mantido: ${local.date} ${time}.`
					);
					return;
				}
				state.draft = result;
				await save(file, state);
			}
			const current = localDateTime(now());
			if (
				current.date !== local.date ||
				current.minute - local.minute >= 15 ||
				current.minute >= Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + 15
			)
				return;
			if (!state.subjectUpdated) {
				const result = (await options.ask('group_set_subject', {
					chatId: GROUP_ID,
					subject: state.draft.subject,
				})) as { updated?: boolean } | undefined;
				if (result?.updated !== true)
					throw new Error('Nome não confirmado pela ZAPO');
				state.subjectUpdated = true;
				await save(file, state);
			}
			const result = (await options.ask('group_set_picture', {
				chatId: GROUP_ID,
				imageBase64: state.draft.imageBase64,
			})) as { updated?: boolean } | undefined;
			if (result?.updated !== true) throw new Error('Foto não confirmada pela ZAPO');
			state.pictureUpdated = true;
			await save(file, state);
			console.info(
				`[BaguncinhaNews] Nome e foto confirmados: ${local.date} ${time}.`
			);
		} finally {
			busy = false;
		}
	};
};
