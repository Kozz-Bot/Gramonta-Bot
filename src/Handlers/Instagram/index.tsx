import { createSocialVideoHandler } from '../SocialVideo/handler';
import { Help } from './messages';

export const startInstagramHandler = () =>
	createSocialVideoHandler('instagram', Help);
