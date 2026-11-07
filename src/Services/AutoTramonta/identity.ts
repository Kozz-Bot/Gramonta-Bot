// Added by the sender, never requested from the model.
export const AUTO_MARKER = '\u200B';
export const HUMAN_RECENT_MS = 120_000;
export const isAutoMessage = (text: string) => text.trimEnd().endsWith(AUTO_MARKER);
export const stripAutoMarker = (text: string) => text.replace(/\u200B/g, '');
export const markAutoMessage = (text: string) =>
	`${stripAutoMarker(text).trim()}${AUTO_MARKER}`;

export const isOwnerMessage = (
	message: { fromHostAccount?: boolean; from?: string; contact?: { id?: string } },
	ids: string[]
) =>
	Boolean(
		message.fromHostAccount ||
		[message.from, message.contact?.id].some(
			id => id && ids.includes(id.replace(/:\d+(?=@)/, ''))
		)
	);
