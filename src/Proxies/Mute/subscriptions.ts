import { Socket } from 'socket.io-client';
import { getActiveMuteRoutes } from './mutedDB';

export const createMuteSubscriptions = (socket: Socket) => {
	let ready = false;
	let expirationTimer: ReturnType<typeof setTimeout> | undefined;
	const subscribed = new Map<string, { boundary: string; chats: string[] }>();

	const clearExpirationTimer = () => {
		if (expirationTimer) clearTimeout(expirationTimer);
		expirationTimer = undefined;
	};

	const sync = () => {
		clearExpirationTimer();
		if (!ready) return;
		const routes = getActiveMuteRoutes();
		const desired = new Set(routes.map(route => JSON.stringify([route.boundary, route.chat])));

		for (const [key, source] of subscribed) {
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
			expirationTimer = setTimeout(sync, Math.min(2_147_483_647, Math.max(1, nextExpiration - Date.now())));
			expirationTimer.unref();
		}
	};

	socket.on('disconnect', () => {
		ready = false;
		subscribed.clear();
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
