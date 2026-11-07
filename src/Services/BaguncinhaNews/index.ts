import path from 'node:path';
import { createModule } from 'kozz-module-maker';
import { generateNewsDraft } from './content';
import { createNewsRunner } from './runner';

export const startBaguncinhaNews = () => {
	const module = createModule({
		name: 'baguncinha-news',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
	const ask = async (resource: string, payload: Record<string, unknown> = {}) => {
		if (!module.socket.connected) throw new Error('Gateway desconectado');
		let replyEvent: string | undefined;
		const capture = (event: string, data: { request?: { id?: string } }) => {
			if (event === 'ask_resource' && data.request?.id)
				replyEvent = `reply_resource/${data.request.id}`;
		};
		module.socket.onAnyOutgoing(capture);
		const request = module.ask.boundary('kozz-zapo', resource, payload);
		module.socket.offAnyOutgoing(capture);
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const result = await Promise.race([
				request,
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error('ZAPO não respondeu no prazo')),
						75_000
					);
				}),
			]);
			return result.response;
		} finally {
			if (timer) clearTimeout(timer);
			if (replyEvent) module.socket.removeAllListeners(replyEvent);
		}
	};
	const tick = createNewsRunner({
		directory: path.resolve('.runtime/baguncinha-news'),
		ask,
		generate: generateNewsDraft,
	});
	let started = false;
	module.socket.on('introduction_ack', (ack: { success?: boolean }) => {
		if (!ack?.success || started) return;
		started = true;
		console.info(
			'[BaguncinhaNews] Agenda ativa: diariamente às 10:30 e 19:00, America/Sao_Paulo.'
		);
		const loop = async () => {
			try {
				await tick();
			} catch {
				console.warn(
					'[BaguncinhaNews] Falha na atualização; até três tentativas na janela de 15 minutos. Consulte o histórico privado.'
				);
			} finally {
				setTimeout(
					() => {
						void loop();
					},
					60_000 - (Date.now() % 60_000)
				);
			}
		};
		void loop();
	});
	return module;
};
