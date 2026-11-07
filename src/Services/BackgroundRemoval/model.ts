import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import axios from 'axios';

export const MODEL_URL =
	'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx';
export const MODEL_SHA256 =
	'309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';
export const defaultModelPath = () =>
	path.resolve('.runtime/background-removal/models/u2netp.onnx');
export const verifyModel = (bytes: Buffer) =>
	bytes.length === 4574861 &&
	createHash('sha256').update(bytes).digest('hex') === MODEL_SHA256;

// Explicit setup only. User requests never download models or select a URL/path.
export const installModel = async () => {
	const file = defaultModelPath();
	try {
		if (verifyModel(await fs.readFile(file))) return file;
	} catch {
		/* Install missing weights. */
	}
	const response = await axios.get(MODEL_URL, {
		responseType: 'arraybuffer',
		timeout: 60000,
		maxContentLength: 6_000_000,
		maxBodyLength: 6_000_000,
	});
	const bytes = Buffer.from(response.data);
	if (!verifyModel(bytes)) throw new Error('Model checksum mismatch');
	await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
	const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
	try {
		await fs.writeFile(temp, bytes, { mode: 0o600 });
		await fs.rename(temp, file);
	} finally {
		await fs.rm(temp, { force: true });
	}
	return file;
};
