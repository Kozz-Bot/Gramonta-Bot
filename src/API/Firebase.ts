// src/lib/firebase.ts
import {
	initializeApp,
	applicationDefault,
	getApp,
	getApps,
} from 'firebase-admin/app';
import { getStorage, getDownloadURL } from 'firebase-admin/storage';
import { Media, MessageReceived } from 'kozz-types';

// Accept both "my-bucket.appspot.com" and "gs://my-bucket.appspot.com"
const rawBucket = process.env.FIREBASE_BUCKET || '';
const bucketName = rawBucket.replace(/^gs:\/\//, '').trim();

if (!bucketName) {
	throw new Error(
		'FIREBASE_BUCKET env var is missing. Expected something like "my-project.appspot.com" (no protocol).'
	);
}

const app = getApps().length
	? getApp()
	: initializeApp({
			credential: applicationDefault(),
			storageBucket: bucketName, // <-- set default bucket here
	  });

// Now you can omit the name because we set storageBucket above
export const bucket = getStorage(app).bucket();

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
