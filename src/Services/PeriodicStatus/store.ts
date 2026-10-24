import { access, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { StatusRecord, StatusStore } from './types';

export const createStatusStore = (directory: string): StatusStore => {
	const fileFor = (record: Pick<StatusRecord, 'date' | 'destination' | 'publicationId'>) => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) throw new Error('Data inválida no histórico de status');
		const identity = record.publicationId ? JSON.stringify([record.destination, record.publicationId]) : record.destination;
		const key = createHash('sha256').update(identity).digest('hex');
		return path.join(directory, `${record.date}-${key}.json`);
	};
	return {
		async has(date, destination, publicationId) {
			try {
				await access(fileFor({ date, destination, publicationId }));
				return true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
				throw error;
			}
		},
		async claim(record) {
			await mkdir(directory, { recursive: true });
			let file;
			try {
				file = await open(fileFor(record), 'wx', 0o600);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
				throw error;
			}
			try {
				await file.writeFile(JSON.stringify(record, null, 2));
			} finally {
				await file.close();
			}
			return true;
		},
		async finish(record) {
			const target = fileFor(record);
			const temporary = `${target}.${randomUUID()}.tmp`;
			try {
				await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
				await rename(temporary, target);
			} finally {
				await rm(temporary, { force: true });
			}
		},
	};
};
