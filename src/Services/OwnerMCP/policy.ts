export const scopes = [
	'whatsapp.read',
	'whatsapp.send',
	'whatsapp.commands',
	'whatsapp.groups',
	'whatsapp.automations',
] as const;
export const toolScopes: Record<string, string> = {
	owner_find_chats: 'whatsapp.read',
	owner_chat_history: 'whatsapp.read',
	owner_list_commands: 'whatsapp.commands',
	owner_send_message: 'whatsapp.send',
	owner_set_group_subject: 'whatsapp.groups',
	owner_set_group_picture: 'whatsapp.groups',
	owner_periodic_posts: 'whatsapp.automations',
	owner_set_periodic_posts: 'whatsapp.automations',
	owner_execute_command: 'whatsapp.commands',
};
export type Permissions = { scopes: string[]; chats: string[]; commands: string[] };
export const chatIdValid = (v: unknown): v is string =>
	typeof v === 'string' && /^\d+(?:-\d+)?@(g\.us|s\.whatsapp\.net|lid)$/.test(v);
export const validatePermissions = (p: any): p is Permissions =>
	Boolean(
		p &&
		Array.isArray(p.scopes) &&
		p.scopes.length > 0 &&
		p.scopes.length <= scopes.length &&
		p.scopes.every((s: any) => scopes.includes(s)) &&
		Array.isArray(p.chats) &&
		p.chats.length > 0 &&
		p.chats.length <= 100 &&
		p.chats.every((c: any) => c === '*' || chatIdValid(c)) &&
		Array.isArray(p.commands) &&
		p.commands.length <= 200 &&
		p.commands.every(
			(c: any) =>
				c === '*' ||
				(typeof c === 'string' && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(c))
		) &&
		(!p.scopes.includes('whatsapp.commands') || p.commands.length > 0) &&
		// Arbitrary modules and periodic jobs can affect other chats: these require explicit account-wide consent.
		(!p.scopes.some((s: string) =>
			['whatsapp.commands', 'whatsapp.automations'].includes(s)
		) ||
			p.chats.includes('*'))
	);
export const chatAllowed = (p: Permissions, id: string) =>
	p.chats.includes('*') || p.chats.includes(id);
export const toolAllowed = (
	p: Permissions,
	name: string,
	args: Record<string, unknown> = {}
) => {
	if (!p.scopes.includes(toolScopes[name])) return false;
	if (
		args.chatId !== undefined &&
		(typeof args.chatId !== 'string' || !chatAllowed(p, args.chatId))
	)
		return false;
	if (name === 'owner_execute_command')
		return (
			p.commands.includes('*') ||
			p.commands.includes(`${args.module}.${args.method}`)
		);
	return true;
};
