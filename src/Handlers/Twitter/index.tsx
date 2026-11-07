import { createSocialVideoHandler } from '../SocialVideo/handler';
import { Help } from './messages';

export const startTwitterHandler = () => createSocialVideoHandler('twitter', Help);
