import { MimeType } from 'kozz-module-maker/dist/Message/PayloadCreation/Media';

export type ReplyTextAction = {
	type: 'reply_text';
	text: string;
};

export type ReplyMediaAction = {
	type: 'reply_media';
	mediaUrl: string;
	mediaType: MimeType;
	caption?: string;
};

export type BotAction = ReplyTextAction | ReplyMediaAction;
