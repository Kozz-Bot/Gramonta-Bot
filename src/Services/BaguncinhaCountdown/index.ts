import { createModule } from 'kozz-module-maker';
import { runCountdown } from './countdown';

export const startBaguncinhaCountdown = () => {
	const module = createModule({
		name: 'baguncinha-countdown',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
	let started = false;
	module.socket.on('introduction_ack', (ack: { success?: boolean }) => {
		if (!ack?.success || started) return;
		started = true;
		void runCountdown(async (resource, payload) => {
			if (!module.socket.connected) throw new Error('Gateway desconectado');
			let timer: ReturnType<typeof setTimeout> | undefined;
			let replyEvent: string | undefined;
			const captureRequest = (event: string, data: { request?: { id?: string } }) => {
				if (event === 'ask_resource' && data.request?.id) replyEvent = `reply_resource/${data.request.id}`;
			};
			module.socket.onAnyOutgoing(captureRequest);
			const request = module.ask.boundary('kozz-zapo', resource, payload);
			module.socket.offAnyOutgoing(captureRequest);
			try {
				const result = await Promise.race([
					request,
					new Promise<never>((_, reject) => {
						timer = setTimeout(() => reject(new Error('ZAPO não respondeu em 45s')), 45_000);
					}),
				]);
				return result.response;
			} finally {
				if (timer) clearTimeout(timer);
				if (replyEvent) module.socket.removeAllListeners(replyEvent);
			}
		}, () => {
			console.info('[BaguncinhaCountdown] Nome final confirmado; serviço encerrado.');
			module.socket.disconnect();
		}, { onError: error => console.warn('[BaguncinhaCountdown]', error instanceof Error ? error.message : 'Falha ao atualizar grupo') });
	});
	return module;
};
