import { Media } from 'kozz-types';
import CDNApi from './CDNApi';

const TEMPORARY_CDN_MEDIA_TTL_MS = 10 * 60 * 1000;

const mimeExtension = (mimeType: string) => {
	if (mimeType.includes('jpeg')) return 'jpg';
	if (mimeType.includes('png')) return 'png';
	if (mimeType.includes('webp')) return 'webp';
	if (mimeType.includes('gif')) return 'gif';
	return 'bin';
};

const temporaryFileName = (media: Media, prefix: string) => {
	const safePrefix = prefix.replace(/[^a-zA-Z0-9._-]/g, '_');
	return `${safePrefix}-${Date.now()}-${Math.random()
		.toString(36)
		.slice(2)}.${mimeExtension(media.mimeType)}`;
};

const scheduleCleanup = (fileName: string) => {
	const timer = setTimeout(async () => {
		try {
			await CDNApi.deletePublicFile(fileName);
		} catch (e) {
			console.warn(`Failed to delete temporary CDN file ${fileName}`, e);
		}
	}, TEMPORARY_CDN_MEDIA_TTL_MS);

	timer.unref?.();
};

export const getTemporaryCdnMediaUrl = async (
	media: Media,
	prefix = 'llm-media'
) => {
	if (media.transportType === 'url') {
		return media.data;
	}

	const fileName = temporaryFileName(media, prefix);
	const base64 = Buffer.from(media.data, 'base64url').toString('base64');
	const url = await CDNApi.uploadPublicFile(fileName, base64);
	scheduleCleanup(fileName);
	return url;
};
