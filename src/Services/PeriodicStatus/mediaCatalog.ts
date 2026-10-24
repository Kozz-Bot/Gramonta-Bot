import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';
import type { StatusProvider } from './types';
import { firstSeconds } from './video';

export const periodicMediaDirectory = path.resolve(__dirname, '../../../media/saved/periodic');

// Horários extraídos dos nomes dos arquivos, no fuso de Brasília.
export const periodicMediaCatalog = [
	{ statusId: 'everyday-midnight', filename: 'everyday-at-00:00.mp4', weekdays: [0, 1, 2, 3, 4, 5, 6], time: '00:00', duration: 5.549569 },
	{ statusId: 'monday-noon', filename: 'monday-noon.png', weekdays: [1], time: '12:00', duration: null },
	{ statusId: 'tuesday-11am', filename: 'Tuesday-11AM.png', weekdays: [2], time: '11:00', duration: null },
	{ statusId: 'wednesday-4pm', filename: 'wednesday-4PM.mp4', weekdays: [3], time: '16:00', duration: 5.619229 },
	{ statusId: 'thursday-11am', filename: 'thursday-11AM.jpeg', weekdays: [4], time: '11:00', duration: null },
	{ statusId: 'friday-10am', filename: 'friday-10AM.mp4', weekdays: [5], time: '10:00', duration: 20.641995 },
	{ statusId: 'saturday-10am', filename: 'saturday-10AM.mp4', weekdays: [6], time: '10:00', duration: 209.792290, trimToSeconds: 90 },
	{ statusId: 'sunday-1118pm', filename: 'sunday-11:18PM.jpeg', weekdays: [0], time: '23:18', duration: null },
] as const;

export const createMediaProvider = (
	filename: string,
	duration: number | null,
	options: { directory?: string; trimToSeconds?: number } = {},
): StatusProvider => async () => {
	if (path.basename(filename) !== filename) throw new Error('Nome de arquivo de status inválido');
	const source = path.join(options.directory || periodicMediaDirectory, filename);
	const mimeType = mime.lookup(filename);
	if (!mimeType || !/^(image|video|audio)\//.test(mimeType)) throw new Error('Tipo de mídia de status inválido');
	const info = await stat(source);
	if (!info.isFile() || !info.size || info.size > 64 * 1024 * 1024) throw new Error('Mídia de status vazia ou maior que 64 MB');
	const trim = options.trimToSeconds;
	if (trim !== undefined && (!mimeType.startsWith('video/') || duration === null)) throw new Error('Recorte disponível somente para vídeo');
	const bytes = trim !== undefined ? await firstSeconds(source, trim) : await readFile(source);
	return {
		body: '',
		media: {
			data: bytes.toString('base64'), fileName: filename, mimeType, transportType: 'b64',
			sizeInBytes: bytes.length, duration: trim !== undefined ? Math.min(duration!, trim) : duration, stickerTags: [],
		},
	};
};
