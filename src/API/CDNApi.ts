import axios from 'axios';

const api = axios.create({
	baseURL: process.env.CDN_BASE_URL ?? 'http://127.0.0.1:1589',
	headers: {
		Authorization: process.env.CDN_TOKEN,
	},
});

type UploadFileResponse = {
	status: 'success' | 'failed';
	fileUrl: string;
};

const normalizeFileUrl = (fileUrl: string) => {
	const normalizedProtocolUrl = fileUrl.replace(/^http:\/\//, 'https://');

	try {
		const parsedUrl = new URL(normalizedProtocolUrl);

		if (parsedUrl.hostname === 'gramont.ddns.net') {
			parsedUrl.hostname = 'gramont.digital';
		}

		return parsedUrl.toString();
	} catch {
		return normalizedProtocolUrl;
	}
};

const instance = () => {
	const uploadFile = async (
		userspace: string,
		fileName: string,
		dataInB64: string
	) => {
		const { data } = await api.post<UploadFileResponse>('/file/upload', {
			userspace,
			fileName,
			data: dataInB64,
		});

		return normalizeFileUrl(data.fileUrl);
	};

	const uploadFileFromUrl = async (
		userspace: string,
		fileName: string,
		fileUrl: string
	) => {
		const response = await axios(fileUrl, { responseType: 'arraybuffer' });
		const base64 = Buffer.from(response.data, 'binary').toString('base64');

		return uploadFile(userspace, fileName, base64);
	};

	const uploadPublicFile = (fileName: string, dataInB64: string) =>
		uploadFile('public', fileName, dataInB64);

	const deleteFile = async (userspace: string, fileName: string) => {
		await api.post('/file/delete', {
			userspace,
			fileName,
		});
	};

	const deletePublicFile = (fileName: string) => deleteFile('public', fileName);

	const getPublicFile = (fileName: string) =>
		api.get(`/file/public/${fileName}`).then(resp => resp.data);

	return {
		uploadFile,
		uploadPublicFile,
		deleteFile,
		deletePublicFile,
		getPublicFile,
		uploadFileFromUrl,
	};
};

export default instance();
