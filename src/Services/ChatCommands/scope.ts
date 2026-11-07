import { AsyncLocalStorage } from 'node:async_hooks';
import { AiToolInputError } from '../OwnerAI/contracts';

export type ChatScope = {
	updateGroupsControl?: boolean;
	chatId: string;
	boundaryId: string;
	boundaryName: string;
	messageIds: Set<string>;
	personIds: Set<string>;
	violation?: string;
	replies?: string[];
};
const storage = new AsyncLocalStorage<ChatScope>();
export const currentChatScope = () => storage.getStore();
export const inChatScope = <T>(scope: ChatScope, fn: () => T) =>
	storage.run(scope, fn);
const guarded = new WeakSet<object>();
const fail = (scope: ChatScope, reason: string): never => {
	scope.violation = reason;
	throw new AiToolInputError(reason);
};
const sameBoundary = (scope: ChatScope, id: unknown) =>
	id === scope.boundaryId || id === scope.boundaryName;
const checkChat = (scope: ChatScope, id: unknown) => {
	if (id !== scope.chatId)
		fail(scope, 'A IA só pode executar ações no chat em que o pedido foi feito.');
};

const checkEmission = (
	scope: ChatScope,
	event: string,
	payload: any,
	socket: any
) => {
	if (event === 'ask_resource') {
		const target = payload?.responder,
			request = payload?.request;
		const name = request?.resource,
			data = request?.data || {};
		if (target?.type === 'Handler' && name === 'help') return;
		if (target?.type === 'Gateway' && name === 'all_modules') return;
		if (target?.type !== 'Boundary' || !sameBoundary(scope, target.id))
			fail(scope, 'Consulta fora do chat ou da conexão de origem bloqueada.');
		if (
			[
				'group_chat_info',
				'group_admin_list',
				'message_count',
				'recent_chat_messages',
				'recent_chat_messages_with_media',
				'chat_read',
				'group_event',
				'send_reminder',
				'group_members',
			].includes(name)
		) {
			checkChat(scope, data.chatId);
			if (
				name === 'chat_read' &&
				(data.messageIds || []).some((id: string) => !scope.messageIds.has(id))
			)
				fail(scope, 'Só é possível acessar mensagens deste pedido e suas citações.');
			if (
				['message_count', 'group_members', 'group_chat_info'].includes(name) &&
				socket.once
			)
				socket.once(`reply_resource/${request.id}`, (result: any) => {
					const entries = Array.isArray(result?.response)
						? result.response
						: result?.response?.matches || result?.response?.participants || [];
					for (const entry of entries)
						for (const id of [entry.id, entry.contactId, ...(entry.aliases || [])])
							if (typeof id === 'string') scope.personIds.add(id);
				});
			return;
		}
		if (
			['cached_message_by_id', 'message_by_id', 'chat_media_message'].includes(name)
		) {
			checkChat(scope, data.chatId);
			if (!scope.messageIds.has(data.messageId || data.id))
				fail(scope, 'A mídia precisa vir de uma mensagem deste chat.');
			return;
		}
		if (
			[
				'contact_info',
				'contact_profile_pic',
				'jid_from_lid',
				'lid_from_jid',
			].includes(name)
		) {
			const id = data.id || data.contactId || data.jid || data.lid;
			if (!scope.personIds.has(id))
				fail(scope, 'Só é possível consultar participantes deste chat.');
			if (socket.once)
				socket.once(`reply_resource/${request.id}`, (result: any) => {
					for (const alias of [
						result?.response?.id,
						result?.response?.jid,
						result?.response?.lid,
					])
						if (typeof alias === 'string') scope.personIds.add(alias);
				});
			return;
		}
		if (name === 'chat_status') return;
		// Only the reviewed owner-only updates handler receives this capability.
		// It can discover destinations, but all message emissions stay in the source chat.
		if (scope.updateGroupsControl && name === 'all_groups') return;
		fail(
			scope,
			'Esse recurso não está disponível no atalho da IA restrito ao chat.'
		);
	}
	if (
		[
			'reply_with_text',
			'reply_with_media',
			'reply_with_sticker',
			'send_message',
		].includes(event)
	) {
		checkChat(scope, payload?.chatId);
		if (!sameBoundary(scope, payload.boundaryId))
			fail(scope, 'Envio para outra conexão bloqueado.');
		if (payload.quoteId && !scope.messageIds.has(payload.quoteId))
			fail(scope, 'Citação fora do chat de origem bloqueada.');
		if (
			scope.replies &&
			typeof payload.body === 'string' &&
			payload.body &&
			scope.replies.length < 4
		)
			scope.replies.push(payload.body.slice(0, 1200));
		return;
	}
	if (['react_message', 'delete_message', 'edit_message'].includes(event)) {
		if (
			!sameBoundary(scope, payload?.boundaryId || payload?.boundaryName) ||
			!scope.messageIds.has(payload?.messageId)
		)
			fail(scope, 'Só é possível alterar mensagens deste pedido e suas citações.');
		return;
	}
	if (
		['request_proxy', 'revoke_proxy'].includes(event) &&
		payload?.subscriber === 'mute'
	) {
		if (
			!sameBoundary(scope, payload.source?.boundary) ||
			!Array.isArray(payload.source?.chats) ||
			!payload.source.chats.length ||
			payload.source.chats.some((id: string) => id !== scope.chatId)
		)
			fail(scope, 'Uma inscrição de outro chat foi bloqueada.');
		return;
	}
	fail(
		scope,
		'Essa operação pode afetar outros chats e não está disponível pelo atalho da IA.'
	);
};

// Per-async-call context: concurrent commands in other chats keep their own
// destinations. Timers created by a command inherit the restriction too.
export const guardModuleSocket = (socket: any) => {
	if (!socket || typeof socket.emit !== 'function' || guarded.has(socket)) return;
	guarded.add(socket);
	const emit = socket.emit;
	socket.emit = function (event: string, payload: unknown, ...args: unknown[]) {
		const scope = currentChatScope();
		if (scope) {
			try {
				checkEmission(scope, event, payload, socket);
			} catch (error) {
				if (event === 'ask_resource') throw error;
				// A delayed fire-and-forget send must be blocked without crashing PM2.
				return false;
			}
		}
		return emit.call(this, event, payload, ...args);
	};
};
