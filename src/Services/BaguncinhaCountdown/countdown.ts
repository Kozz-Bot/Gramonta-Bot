export const DEADLINE = Date.parse('2026-10-25T17:00:00-03:00');
export const HOUR = 3_600_000;
export const FINAL_SUBJECT = 'Baguncinha: Apuração começou!';

type Ask = (resource: string, payload: Record<string, unknown>) => Promise<unknown>;
type Group = { id: string; name: string };

export const subjectAt = (now: number) => now >= DEADLINE
	? FINAL_SUBJECT
	: `Baguncinha: ${Math.ceil((DEADLINE - now) / HOUR)} hora para enterrar o PT`;

export const updateBaguncinha = async (ask: Ask, now: () => number) => {
	const groups = await ask('all_groups', {});
	if (!Array.isArray(groups)) throw new Error('Lista de grupos indisponível');
	const matches = groups.filter((group): group is Group =>
		typeof group?.id === 'string' && group.id.endsWith('@g.us') &&
		typeof group?.name === 'string' && group.name.startsWith('Baguncinha'));
	if (matches.length !== 1) throw new Error(`Esperado um grupo Baguncinha; encontrados ${matches.length}`);
	const group = matches[0];
	const subject = subjectAt(now());
	if (group.name !== subject) {
		const result = await ask('group_set_subject', { chatId: group.id, subject }) as { updated?: boolean } | undefined;
		if (result?.updated !== true) throw new Error('Alteração do nome não confirmada');
	}
	return subject === FINAL_SUBJECT;
};

export const runCountdown = (
	ask: Ask,
	onComplete: () => void,
	options: {
		now?: () => number;
		schedule?: (callback: () => void, delay: number) => unknown;
		onError?: (error: unknown) => void;
	} = {},
) => {
	const now = options.now || Date.now;
	const schedule = options.schedule || setTimeout;
	const tick = async () => {
		let delay: number;
		try {
			if (await updateBaguncinha(ask, now)) {
				onComplete();
				return;
			}
			// Align updates to the full hour and wake exactly at the deadline.
			const current = now();
			delay = Math.max(1, Math.min(HOUR - current % HOUR, DEADLINE - current));
		} catch (error) {
			options.onError?.(error);
			delay = 60_000;
		}
		schedule(() => { void tick(); }, delay);
	};
	return tick();
};
