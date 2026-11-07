import { createSocialVideoHandler } from '../SocialVideo/handler';
import { Help } from './messages';

export const startTikTokHandler = () => createSocialVideoHandler('tiktok', Help);
