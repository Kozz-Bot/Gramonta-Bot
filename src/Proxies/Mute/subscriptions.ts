import type { createModule } from 'kozz-module-maker';
import { getActiveMuteRoutes } from './mutedDB';
import { currentChatScope } from '../../Services/ChatCommands/scope';

export const createMuteSubscriptions = (
	socket: ReturnType<typeof createModule>['socket']
) => {
	let ready = false;
	let expirationTimer: ReturnType<typeof setTimeout> | undefined;
	const scopedTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const subscribed = new Map<string, { boundary: string; chats: string[] }>();

	const clearExpirationTimer = () => {
		if (expirationTimer) clearTimeout(expirationTimer);
		expirationTimer = undefined;
	};

	const sync = () => {
		const scope = currentChatScope();
		const scopeKey = scope
			? JSON.stringify([scope.boundaryName, scope.chatId])
			: undefined;
		if (scopeKey) {
			clearTimeout(scopedTimers.get(scopeKey));
			scopedTimers.delete(scopeKey);
		} else {
			clearExpirationTimer();
			for (const timer of scopedTimers.values()) clearTimeout(timer);
			scopedTimers.clear();
		}
		if (!ready) return;
		const routes = getActiveMuteRoutes().filter(
			route =>
				!scope ||
				(route.boundary === scope.boundaryName && route.chat === scope.chatId)
		);
		const desired = new Set(
			routes.map(route => JSON.stringify([route.boundary, route.chat]))
		);

		for (const [key, source] of subscribed) {
			if (
				scope &&
				(source.boundary !== scope.boundaryName ||
					source.chats.some(chat => chat !== scope.chatId))
			)
				continue;
			if (desired.has(key)) continue;
			socket.emit('revoke_proxy', { subscriber: 'mute', source });
			subscribed.delete(key);
		}
		for (const route of routes) {
			const key = JSON.stringify([route.boundary, route.chat]);
			if (subscribed.has(key)) continue;
			const source = { boundary: route.boundary, chats: [route.chat] };
			socket.emit('request_proxy', { subscriber: 'mute', source });
			subscribed.set(key, source);
		}

		if (routes.length) {
			const nextExpiration = Math.min(...routes.map(route => route.expiration));
			// Node timers cannot represent delays above a signed 32-bit integer.
			const timer = setTimeout(
				sync,
				Math.min(2_147_483_647, Math.max(1, nextExpiration - Date.now()))
			);
			timer.unref();
			if (scopeKey) scopedTimers.set(scopeKey, timer);
			else expirationTimer = timer;
		}
	};

	socket.on('disconnect', () => {
		ready = false;
		subscribed.clear();
		for (const timer of scopedTimers.values()) clearTimeout(timer);
		scopedTimers.clear();
		clearExpirationTimer();
	});
	socket.on('introduction_ack', (ack: { success?: boolean }) => {
		ready = Boolean(ack?.success);
		if (!ready) return;
		// Rebuild after registration, including reconnects and a gateway restart.
		// This also removes subscriptions left by the previous static proxy.
		socket.emit('revoke_proxy', { subscriber: 'mute' });
		subscribed.clear();
		sync();
	});

	return { sync };
};
