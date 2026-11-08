import { createDownloadHandler } from './handler';

export const startVideoDownloadHandler = () => createDownloadHandler('video');
export const startAudioDownloadHandler = () => createDownloadHandler('audio');
