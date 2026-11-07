import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StatusDestination } from './types';

export type PeriodicGroup = { id: string; name: string };
export type GroupSettings = { enabled: boolean; groups: PeriodicGroup[] };

export const validateGroupSettings: (
	value: unknown
) => asserts value is GroupSettings = value => {
	const s = value as GroupSettings;
	if (
		!s ||
		typeof s.enabled !== 'boolean' ||
		!Array.isArray(s.groups) ||
		s.groups.some(
			g =>
				!g ||
				typeof g.id !== 'string' ||
				!/^\d+(?:-\d+)?@g\.us$/.test(g.id) ||
				typeof g.name !== 'string' ||
				!g.name.trim()
		) ||
		new Set(s.groups.map(g => g.id)).size !== s.groups.length ||
		(s.enabled && !s.groups.length)
	) {
		throw new Error('Configuração dos envios para grupos inválida.');
	}
};

export const createGroupSettingsStore = (
	directory = path.resolve('.runtime/periodic-status')
) => {
	const file = path.join(directory, 'groups.json');
	let current: GroupSettings | undefined;
	const load = (): GroupSettings => {
		if (!current) {
			const value: unknown = fs.existsSync(file)
				? JSON.parse(fs.readFileSync(file, 'utf8'))
				: { enabled: false, groups: [] };
			validateGroupSettings(value);
			current = value;
		}
		return structuredClone(current);
	};
	const save = (settings: GroupSettings) => {
		validateGroupSettings(settings);
		fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
		const temp = `${file}.${randomUUID()}.tmp`;
		try {
			fs.writeFileSync(temp, JSON.stringify(settings, null, 2), { mode: 0o600 });
			fs.renameSync(temp, file);
		} finally {
			fs.rmSync(temp, { force: true });
		}
		current = structuredClone(settings);
	};
	return { load, save };
};

// Shared by the private control handler and the scheduler in the same process.
export const periodicGroups = createGroupSettingsStore();
export const groupDestinations = (settings: GroupSettings): StatusDestination[] =>
	settings.enabled
		? settings.groups.map(g => ({ kind: 'group', chatId: g.id }))
		: [];
