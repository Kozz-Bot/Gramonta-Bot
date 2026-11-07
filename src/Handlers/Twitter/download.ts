import { downloadSocialVideo } from '../../Services/SocialVideo/download';
import { normalizeSocialUrl } from '../../Services/SocialVideo/urls';
export { MAX_BYTES } from '../../Services/SocialVideo/download';
export { SocialVideoError as TwitterError } from '../../Services/SocialVideo/urls';

export const normalizeTweetUrl = (input: string) =>
	normalizeSocialUrl(input, 'twitter');
export const downloadTwitterVideo = (input: string) =>
	downloadSocialVideo(input, 'twitter');
