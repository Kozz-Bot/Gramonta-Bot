import fs from 'node:fs';
import path from 'node:path';
import { defaults, Settings, validateSettings } from './engine';

export const createAutoStore = (
	directory = path.resolve('.runtime/autotramonta')
) => {
	const file = path.join(directory, 'config.json');
	const save = (settings: Settings) => {
		validateSettings(settings);
		fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
		const temp = `${file}.tmp`;
		fs.writeFileSync(temp, JSON.stringify(settings, null, 2), { mode: 0o600 });
		fs.renameSync(temp, file);
	};
	const load = (): Settings => {
		if (fs.existsSync(file)) {
			const settings: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
			validateSettings(settings);
			return settings;
		}
		const ownerIds = (process.env.AUTOTRAMONTA_OWNER_IDS || '')
			.split(',')
			.map(id => id.trim())
			.filter(Boolean);
		const settings = { ...defaults(), ownerIds };
		validateSettings(settings);
		save(settings);
		return settings;
	};
	return { load, save };
};
