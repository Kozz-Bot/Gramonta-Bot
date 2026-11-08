import type { MessageObj } from 'kozz-module-maker/dist/Message';

// The gateway normalizes command/query for routing. Preserve opaque URL paths,
// IDs and signatures from the original body only for the expected command.
// Synthetic invocations without that body retain their structured arguments.
export const originalCommandQuery = (
	requester: Pick<MessageObj, 'message' | 'rawCommand'>,
	command: string,
	method?: string
): string => {
	const fallback = method
		? requester.rawCommand?.immediateArg
		: requester.rawCommand?.query;
	const original = requester.message.body?.match(
		/^\s*[!/]([^\s]+)(?:\s+([\s\S]*))?$/
	);
	if (original?.[1].toLowerCase() !== command) return fallback?.trim() || '';
	const query = (original[2] || '').trim();
	if (!method) return query;
	const subcommand = query.match(/^(\S+)(?:\s+([\s\S]*))?$/);
	if (subcommand?.[1].toLowerCase() !== method) return fallback?.trim() || '';
	return (subcommand[2] || '').trim();
};
