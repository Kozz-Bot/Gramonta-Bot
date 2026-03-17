import { MessageObj } from 'kozz-module-maker/dist/Message';
import { BotAction } from './BotAction';

export const executeBotAction = async (
	requester: MessageObj,
	action: BotAction
) => {
	if (action.type === 'reply_text') {
		return requester.reply(action.text);
	}

	if (action.type === 'reply_media') {
		return requester.reply.withMedia.fromUrl(
			action.mediaUrl,
			action.mediaType,
			action.caption
		);
	}
};
