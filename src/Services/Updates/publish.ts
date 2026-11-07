import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createUpdateGroupsStore } from './store';
import { Announcement } from './messages';

// A claim precedes emission: an interrupted/uncertain send is never repeated
// automatically for the same repository, commit and group.
export async function publishUpdate(args: {
	repository: string;
	commit: string;
	summary: string;
	directory?: string;
	groups: { id: string; name: string; groupType: string }[];
	send: (chatId: string, body: string) => void;
}) {
	if (
		!/^[a-f0-9]{40,64}$/.test(args.commit) ||
		!args.repository ||
		!args.summary.trim() ||
		args.summary.length > 3500
	)
		throw new Error('Informe commit completo e resumo de 1 a 3500 caracteres.');
	const directory = args.directory || '.runtime/updates';
	const store = createUpdateGroupsStore(path.join(directory, 'groups.json'));
	const results: { chatId: string; status: string }[] = [];
	for (const group of store.list()) {
		const current = args.groups.find(g => g.id === group.id);
		if (
			!current ||
			!['group', 'announcement', 'community_group'].includes(current.groupType)
		) {
			results.push({ chatId: group.id, status: 'unavailable' });
			continue;
		}
		if (!store.list().some(g => g.id === group.id)) continue;
		const key = createHash('sha256')
			.update(JSON.stringify([args.repository, args.commit, group.id]))
			.digest('hex');
		const claims = path.join(directory, 'announcements');
		fs.mkdirSync(claims, { recursive: true, mode: 0o700 });
		const file = path.join(claims, `${key}.json`);
		let fd: number;
		try {
			fd = fs.openSync(file, 'wx', 0o600);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			results.push({ chatId: group.id, status: 'already_claimed_do_not_retry' });
			continue;
		}
		try {
			fs.writeFileSync(
				fd,
				JSON.stringify({
					commit: args.commit,
					chatId: group.id,
					at: new Date().toISOString(),
					status: 'claimed',
				})
			);
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}
		try {
			args.send(group.id, Announcement({ summary: args.summary.trim() }));
			results.push({ chatId: group.id, status: 'forwarded_to_gateway' });
		} catch {
			results.push({ chatId: group.id, status: 'failed_or_unknown_do_not_retry' });
		}
	}
	return results;
}
