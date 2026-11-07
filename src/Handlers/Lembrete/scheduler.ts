import type { Reminder, ReminderStore } from './store';

export const createReminderRunner = (deps: {
	store: ReminderStore;
	ready: (boundary: string) => Promise<boolean>;
	allowed: (r: Reminder) => boolean;
	send: (
		r: Reminder,
		delivery: Reminder['deliveries'][number]
	) => Promise<{ submitted?: boolean }>;
}) => {
	let busy = false;
	return async (now = Date.now()) => {
		if (busy) return;
		busy = true;
		try {
			for (const candidate of deps.store.due(now)) {
				if (!deps.allowed(candidate) || !(await deps.ready(candidate.boundary)))
					continue;
				let r = deps.store.get(candidate.boundary, candidate.chatId, candidate.id);
				if (!['scheduled', 'dispatching'].includes(r.status) || !deps.allowed(r))
					continue;
				for (let i = 0; i < r.deliveries.length; i++) {
					r = deps.store.get(r.boundary, r.chatId, r.id);
					if (!['scheduled', 'dispatching'].includes(r.status) || !deps.allowed(r))
						break;
					if (r.deliveries[i].state !== 'pending') continue;
					if (!(await deps.ready(r.boundary))) break;
					// Controls received while readiness was awaited must win.
					r = deps.store.get(r.boundary, r.chatId, r.id);
					if (!['scheduled', 'dispatching'].includes(r.status) || !deps.allowed(r))
						break;
					r.status = 'dispatching';
					r.deliveries[i].state = 'sending';
					deps.store.put(r);
					try {
						const result = await deps.send(r, r.deliveries[i]);
						r.deliveries[i].state =
							result?.submitted === true ? 'submitted' : 'uncertain';
					} catch (error) {
						r.deliveries[i].state =
							(error as { uncertain?: boolean })?.uncertain === false
								? 'failed'
								: 'uncertain';
					}
					deps.store.put(r);
				}
				r = deps.store.get(r.boundary, r.chatId, r.id);
				if (
					r.status === 'dispatching' &&
					r.deliveries.every(d => d.state !== 'pending' && d.state !== 'sending')
				) {
					r.status = 'complete';
					deps.store.put(r);
				}
			}
		} finally {
			busy = false;
		}
	};
};
