import { createSocialVideoHandler } from '../SocialVideo/handler';
import { Help } from './messages';

export const startFacebookHandler = () => createSocialVideoHandler('facebook', Help);
