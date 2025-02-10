import axios from 'axios';

const api = axios.create({
	baseURL: 'http://gramont.ddns.net/cdn',
	headers: {
		Authorization: process.env.CDN_TOKEN,
	},
});

type UploadFileResponse = {
	status: 'success' | 'failed';
	fileUrl: string;
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

		return data.fileUrl.replace('http', 'https');
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

	const getPublicFile = (fileName: string) =>
		api.get(`/file/public/${fileName}`).then(resp => resp.data);

	return {
		uploadFile,
		uploadPublicFile,
		getPublicFile,
		uploadFileFromUrl,
	};
};

export default instance();
