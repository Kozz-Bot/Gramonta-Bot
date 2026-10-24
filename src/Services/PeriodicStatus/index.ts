import path from 'node:path';
import { createModule } from 'kozz-module-maker';
import { statusProviders, statusSchedule } from './config';
import { createStatusRunner, validateSlots } from './scheduler';
import { createStatusStore } from './store';

export const startPeriodicStatus = () => {
	validateSlots(statusSchedule, statusProviders);
	if (!statusSchedule.length) {
		console.info('[PeriodicStatus] Agenda vazia; nenhum envio agendado.');
		return;
	}
	const module = createModule({
		name: 'periodic-status',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
	// This module issues requests serially; remove its response listener on timeout.
	const ask = async (resource: string, payload: Record<string, unknown> = {}) => {
		if (!module.socket.connected) throw new Error('Gateway desconectado');
		let replyEvent: string | undefined;
		const capture = (event: string, data: { request?: { id?: string } }) => {
			if (event === 'ask_resource' && data.request?.id) replyEvent = `reply_resource/${data.request.id}`;
		};
		module.socket.onAnyOutgoing(capture);
		const request = module.ask.boundary('kozz-zapo', resource, payload);
		module.socket.offAnyOutgoing(capture);
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const timeoutMs = resource === 'publish_periodic_post' ? 330_000 : 45_000;
		try {
			const result = await Promise.race([
				request,
				new Promise<never>((_, reject) => {
					timeout = setTimeout(() => reject(new Error('ZAPO não respondeu no prazo')), timeoutMs);
				}),
			]);
			return result.response;
		} finally {
			if (timeout) clearTimeout(timeout);
			if (replyEvent) module.socket.removeAllListeners(replyEvent);
		}
	};
	const tick = createStatusRunner({
		slots: statusSchedule,
		providers: statusProviders,
		store: createStatusStore(path.resolve('.runtime/periodic-status')),
		ready: async () => {
			if (!module.socket.connected) return false;
			const status = await ask('chat_status') as { connected?: boolean; registered?: boolean; hasQr?: boolean } | undefined;
			return status?.connected === true && status.registered === true && status.hasQr === false;
		},
		publish: async (content, destination, context) => {
			const result = await ask('publish_periodic_post', { content, destination }) as { published?: boolean; messageId?: string; recipientCount?: number } | undefined;
			if (result?.published !== true) throw new Error('Publicação não confirmada');
			console.info(`[PeriodicStatus] Publicação confirmada statusId=${context.slot.statusId} date=${context.date} recipients=${result.recipientCount ?? 'unknown'} messageId=${result.messageId ?? 'unknown'}`);
		},
	});
	let started = false;
	module.socket.on('introduction_ack', (ack: { success?: boolean }) => {
		if (!ack?.success || started) return;
		started = true;
		console.info(`[PeriodicStatus] Agenda ativa: ${statusSchedule.length} publicações semanais, fuso America/Sao_Paulo.`);
		const loop = async () => {
			try {
				await tick();
			} catch (error) {
				console.warn('[PeriodicStatus]', error instanceof Error ? error.message : 'Falha no agendamento');
			} finally {
				setTimeout(() => { void loop(); }, 60_000 - Date.now() % 60_000);
			}
		};
		void loop();
	});
	return module;
};
