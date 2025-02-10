import admin from 'firebase-admin';
import { getStorage, getDownloadURL } from 'firebase-admin/storage';

import { MessageReceived, Media } from 'kozz-types';

const firebase = admin.initializeApp({
	credential: admin.credential.applicationDefault(),
});

export const bucket = getStorage(firebase).bucket(process.env.FIREBASE_BUCKET);

const fileExtension = (media: Media) => {
	if (media.mimeType === 'image/jpeg') {
		return 'jpeg';
	}
	if (media.mimeType === 'video/mp4') {
		return 'mp4';
	}
	if (media.mimeType === 'audio/ogg; codecs=opus') {
		return 'ogg';
	}
	if (media.mimeType === 'audio/mp3') {
		return 'mp3';
	}
	if (media.mimeType === 'audio/opus') {
		return 'opus';
	}
};

export const uploadMediaFromMessage = async (message: MessageReceived) => {
	if (!message.media) {
		throw new Error('No media');
	}
	if (message.media.transportType !== 'b64') {
		throw 'Uploading files from remote URL is not yet implemented';
	}

	const id = `${message.id}.${fileExtension(message.media)}`;

	await bucket.file(id).save(Buffer.from(message.media.data, 'base64'));
	return getMediaURLFromBucket(id);
};

export const uploadMedia = async (id: string, media: Media) => {
	const fileName = `${id}.${fileExtension(media)}`;
	if (media.transportType !== 'b64') {
		throw 'Uploading files from remote URL is not yet implemented';
	}
	console.log(`uploading ${fileName} to bucket`);

	await bucket.file(id).save(Buffer.from(media.data, 'base64'));
	return getMediaURLFromBucket(fileName);
};

export const getMediaURLFromBucket = (id: string) => {
	const fileRef = bucket.file(id);
	return getDownloadURL(fileRef);
};
