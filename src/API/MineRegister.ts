import axios, { isAxiosError } from 'axios';
import qs from 'qs';

const MineRegisterApi = axios.create({
	baseURL: 'https:gramont.ddns.net/mine-register/api/',
});

type ApiSuccess = {
	success: true;
	status: string;
	message: string;
};

type ApiFail = {
	success: false;
	status: string;
	message: string;
};

type MineRegisterApiResponse = ApiSuccess | ApiFail;

export const registerPlayer = async (
	username: string
): Promise<MineRegisterApiResponse> => {
	try {
		const { data } = await MineRegisterApi.post<MineRegisterApiResponse>(
			'/apply',
			qs.stringify({
				username,
				accept: 'on',
			}),
			{
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
			}
		);

		console.log(data);

		return {
			success: data.status === 'success',
			status: data.status,
			message: data.message,
		};
	} catch (e) {
		console.warn(e);
		if (isAxiosError(e)) {
			return {
				success: false,
				status: 'fail',
				message: e.response?.data?.message || 'Unknown reason',
			};
		} else {
			return {
				success: false,
				status: 'fail',
				message: 'Unknown reason',
			};
		}
	}
};
