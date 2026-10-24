import type { DailyStatusSlot, StatusContent, StatusContext, StatusDestination, StatusProvider, StatusRecord, StatusStore } from './types';

export const TIME_ZONE = 'America/Sao_Paulo';
export const destinationKey = (destination: StatusDestination) => destination.kind === 'status' ? 'status' : `group:${destination.chatId}`;
export const publicationKey = (slot: DailyStatusSlot) => `${slot.statusId}@${slot.time}`;

export const validateSlots = (slots: readonly DailyStatusSlot[], providers: ReadonlyMap<string, StatusProvider>) => {
	const publications = new Set<string>();
	for (const slot of slots) {
		if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) throw new Error('Dia da semana inválido');
		const key = `${slot.weekday}/${publicationKey(slot)}`;
		if (publications.has(key)) throw new Error('Publicação duplicada na agenda');
		if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time)) throw new Error('Horário deve usar HH:mm');
		if (!providers.has(slot.statusId)) throw new Error(`Status não registrado: ${slot.statusId}`);
		if (!Array.isArray(slot.destinations) || !slot.destinations.length) throw new Error('Status sem destino');
		const destinations = new Set<string>();
		for (const destination of slot.destinations) {
			if (destination.kind === 'group') {
				if (typeof destination.chatId !== 'string' || !/^\d+(?:-\d+)?@g\.us$/.test(destination.chatId)) throw new Error('Grupo inválido');
			} else if (destination.kind === 'status') {
				if ('audience' in destination) {
					if (destination.audience !== 'all_contacts' || 'recipients' in destination) throw new Error('Público de Status inválido');
				} else if (!Array.isArray(destination.recipients) || !destination.recipients.length ||
					destination.recipients.some((id: unknown) => typeof id !== 'string' || !/^\d+@(s\.whatsapp\.net|lid)$/.test(id))) throw new Error('Defina os contatos que receberão o status');
			} else throw new Error('Tipo de destino inválido');
			const key = destinationKey(destination);
			if (destinations.has(key)) throw new Error('Destino duplicado');
			destinations.add(key);
		}
		publications.add(key);
	}
};

export const localDateTime = (now: Date) => {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
	}).formatToParts(now);
	const part = (type: string) => parts.find(value => value.type === type)!.value;
	const date = `${part('year')}-${part('month')}-${part('day')}`;
	return {
		date,
		weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
		minute: Number(part('hour')) * 60 + Number(part('minute')),
	};
};

export const createStatusRunner = (options: {
	slots: readonly DailyStatusSlot[];
	providers: ReadonlyMap<string, StatusProvider>;
	store: StatusStore;
	publish: (content: StatusContent, destination: StatusDestination, context: StatusContext) => Promise<void>;
	ready?: () => Promise<boolean>;
	now?: () => Date;
	/** Recupera somente atrasos menores que 15 minutos, nunca os dias anteriores. */
	graceMinutes?: number;
}) => {
	validateSlots(options.slots, options.providers);
	const graceMinutes = options.graceMinutes ?? 15;
	if (!Number.isInteger(graceMinutes) || graceMinutes < 1 || graceMinutes > 60) throw new Error('Janela de atraso inválida');
	const now = options.now || (() => new Date());
	let busy = false;
	const runSlot = async (slot: DailyStatusSlot) => {
		const local = localDateTime(now());
		if (slot.weekday !== local.weekday) return;
		const [hour, minute] = slot.time.split(':').map(Number);
		const elapsed = local.minute - (hour * 60 + minute);
		if (elapsed < 0 || elapsed >= graceMinutes) return;
		const pending: StatusDestination[] = [];
		for (const destination of slot.destinations) {
			if (!await options.store.has(local.date, destinationKey(destination), publicationKey(slot))) pending.push(destination);
		}
		if (!pending.length || (options.ready && !await options.ready())) return;
		const context = { date: local.date, timeZone: TIME_ZONE, slot };
		const content = await options.providers.get(slot.statusId)!(context);
		if (!content || (typeof content.body !== 'string') || (!content.body.trim() && !content.media)) {
			throw new Error('Status sem conteúdo');
		}
		// A slow provider must not send after the grace window or on another day.
		const current = localDateTime(now());
		if (current.date !== local.date || current.minute - (hour * 60 + minute) >= graceMinutes) return;
		let failures = 0;
		for (const destination of pending) {
			const record: StatusRecord = {
				date: local.date, statusId: slot.statusId, scheduledTime: slot.time,
				publicationId: publicationKey(slot),
				destination: destinationKey(destination), state: 'sending', updatedAt: now().toISOString(),
			};
			try {
				if (!await options.store.claim(record)) continue;
				try {
					await options.publish(content, destination, context);
				} catch (error) {
					await options.store.finish({ ...record, state: 'failed', updatedAt: now().toISOString() });
					throw error;
				}
				await options.store.finish({ ...record, state: 'sent', updatedAt: now().toISOString() });
			} catch {
				failures++;
			}
		}
		if (failures) throw new Error(`Falha em ${failures} destino(s); consulte o histórico de publicações`);
	};
	return async () => {
		if (busy) return;
		busy = true;
		try {
			const errors: unknown[] = [];
			for (const slot of [...options.slots].sort((a, b) => a.time.localeCompare(b.time))) {
				try {
					await runSlot(slot);
				} catch (error) {
					errors.push(error);
				}
			}
			if (errors.length === 1) throw errors[0];
			if (errors.length > 1) throw new Error(`Falha em ${errors.length} publicações da agenda`);
		} finally {
			busy = false;
		}
	};
};
