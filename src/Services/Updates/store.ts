import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type UpdateGroup = { id: string; name: string };
export const isUpdateGroupId = (id: string) => /^\d+(?:-\d+)?@g\.us$/.test(id);
export const createUpdateGroupsStore = (file = '.runtime/updates/groups.json') => {
	const list = (): UpdateGroup[] => {
		let value: unknown;
		try {
			value = JSON.parse(fs.readFileSync(file, 'utf8'));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw error;
		}
		if (
			!Array.isArray(value) ||
			value.some(
				g =>
					!g ||
					typeof g.id !== 'string' ||
					!isUpdateGroupId(g.id) ||
					typeof g.name !== 'string' ||
					!g.name.trim()
			) ||
			new Set(value.map(g => g.id)).size !== value.length
		)
			throw new Error('Lista de grupos de novidades inválida.');
		return value;
	};
	const save = (groups: UpdateGroup[]) => {
		fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
		const temporary = `${file}.${randomUUID()}.tmp`;
		try {
			fs.writeFileSync(temporary, JSON.stringify(groups, null, 2) + '\n', {
				mode: 0o600,
			});
			fs.renameSync(temporary, file);
		} finally {
			fs.rmSync(temporary, { force: true });
		}
	};
	return {
		list,
		add: (group: UpdateGroup) => {
			if (!isUpdateGroupId(group.id) || !group.name.trim())
				throw new Error('Grupo inválido.');
			save([
				...list().filter(g => g.id !== group.id),
				{ id: group.id, name: group.name },
			]);
		},
		remove: (id: string) => save(list().filter(g => g.id !== id)),
	};
};
export const updateGroups = createUpdateGroupsStore();
