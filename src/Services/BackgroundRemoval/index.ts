import { fork, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultModelPath } from './model';

export class BackgroundRemovalError extends Error {}
const messages: Record<string, string> = {
	INVALID_IMAGE: 'Envie uma foto estática válida de até 8 MB e 16 megapixels.',
	ANIMATED_IMAGE:
		'A remoção de fundo funciona com fotos estáticas. Para GIFs e vídeos, use !s sem --sem-fundo.',
	NO_SUBJECT:
		'Não consegui separar o objeto do fundo nessa foto. Tente uma imagem com o objeto mais destacado.',
};
type Result = { bytes: Buffer; elapsedMs: number; rss: number; maxRss: number };
type Job = {
	id: string;
	bytes: Buffer;
	resolve: (value: Result) => void;
	reject: (reason: Error) => void;
};

export const createBackgroundRemover = (
	options: {
		workerFile?: string;
		modelFile?: string;
		timeoutMs?: number;
		idleMs?: number;
		maxPending?: number;
	} = {}
) => {
	let worker: ChildProcess | undefined;
	let active: Job | undefined;
	let started = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let idle: ReturnType<typeof setTimeout> | undefined;
	let closed = false;
	const queue: Job[] = [];
	const cancelTimer = () => {
		if (timer) clearTimeout(timer);
		timer = undefined;
	};
	const stop = () => {
		if (idle) clearTimeout(idle);
		idle = undefined;
		const old = worker;
		worker = undefined;
		old?.kill('SIGKILL');
	};
	const failed = () => {
		cancelTimer();
		stop();
		const job = active;
		active = undefined;
		job?.reject(
			new BackgroundRemovalError(
				'Não consegui remover o fundo agora. Tente novamente em instantes.'
			)
		);
		pump();
	};
	const pump = () => {
		if (closed || active) return;
		if (!queue.length) {
			if (worker) {
				idle = setTimeout(stop, options.idleMs ?? 600000);
				idle.unref();
			}
			return;
		}
		if (idle) clearTimeout(idle);
		idle = undefined;
		active = queue.shift()!;
		started = performance.now();
		timer = setTimeout(failed, options.timeoutMs ?? 30000);
		timer.unref();
		try {
			if (!worker) {
				const child = fork(
					options.workerFile || path.join(__dirname, 'worker.js'),
					[],
					{
						stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
						serialization: 'advanced',
						execArgv: ['--max-old-space-size=128'],
						env: {
							...process.env,
							OMP_NUM_THREADS: '1',
							OPENBLAS_NUM_THREADS: '1',
							UV_THREADPOOL_SIZE: '1',
						},
					}
				);
				worker = child;
				child.on('error', () => {
					if (worker === child) failed();
				});
				child.on('exit', () => {
					if (worker === child) failed();
				});
				child.on(
					'message',
					(message: {
						id: string;
						output?: Buffer;
						error?: string;
						rss?: number;
						maxRss?: number;
					}) => {
						if (worker !== child || !active || message.id !== active.id) return;
						cancelTimer();
						const job = active;
						active = undefined;
						if (
							message.error ||
							!Buffer.isBuffer(message.output) ||
							message.output.length > 8_000_000
						)
							job.reject(
								new BackgroundRemovalError(
									messages[message.error || ''] ||
										'Não consegui processar essa foto. Reenvie uma imagem estática e tente novamente.'
								)
							);
						else
							job.resolve({
								bytes: message.output,
								elapsedMs: Math.round(performance.now() - started),
								rss: message.rss || 0,
								maxRss: message.maxRss || 0,
							});
						pump();
					}
				);
			}
			const child = worker,
				id = active.id;
			child.send(
				{
					id,
					bytes: active.bytes,
					modelFile: options.modelFile || defaultModelPath(),
				},
				error => {
					if (error && worker === child && active?.id === id) failed();
				}
			);
		} catch {
			failed();
		}
	};
	return {
		remove: (bytes: Buffer): Promise<Result> => {
			if (closed)
				return Promise.reject(
					new BackgroundRemovalError('O removedor de fundo está indisponível.')
				);
			if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 8_000_000)
				return Promise.reject(new BackgroundRemovalError(messages.INVALID_IMAGE));
			if (queue.length + (active ? 1 : 0) >= (options.maxPending ?? 4))
				return Promise.reject(
					new BackgroundRemovalError(
						'Tem algumas fotos na fila. Aguarde um pouco antes de enviar outra.'
					)
				);
			return new Promise((resolve, reject) => {
				queue.push({ id: randomUUID(), bytes, resolve, reject });
				pump();
			});
		},
		close: () => {
			closed = true;
			cancelTimer();
			stop();
			active?.reject(new BackgroundRemovalError('Processamento interrompido.'));
			active = undefined;
			queue
				.splice(0)
				.forEach(job =>
					job.reject(new BackgroundRemovalError('Processamento interrompido.'))
				);
		},
	};
};
export const backgroundRemover = createBackgroundRemover();
