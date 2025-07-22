import axios from 'axios';
import { auth } from 'firebase-admin';

const token = {
	auth_token: '',
	refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
	valid: false,
};

const baseURL = 'https://api.spotify.com/v1/';
const API = axios.create({
	baseURL: baseURL,
});

API.interceptors.request.use(config => {
	config.headers.Authorization = 'Bearer ' + token.auth_token;
	return config;
});

// This API is available to be downloaded at https://github.com/TramontaG/SpotifyApp
const AuthAPI = axios.create({
	baseURL: 'https://gramont.ddns.net/spotify',
});

export const getTokenLink = async () => {
	try {
		const { data } = await AuthAPI.get<string>('/login/token');
		return data;
	} catch (e) {
		console.warn('Error while getting spotify token', e);
	}
};

export const setAuthToken = (authToken: string) => {
	token.auth_token = authToken;
	token.valid = true;

	setTimeout(() => {
		token.valid = false;
	}, 3590 * 1000); // Just short enough from 1 hour, the standard expiration of the token
};

type RefreshTokenResponse = {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
};
export const refreshToken = async (refresh_token: string) => {
	try {
		const { data } = await AuthAPI.post<RefreshTokenResponse>('/login/refresh', {
			refresh_token,
		});

		setAuthToken(data.access_token);

		return data;
	} catch (e) {
		console.warn('Error while trying to refresh token: ' + e);
	}
};

export const assureValidToken = async () => {
	try {
		if (token.valid) {
			return;
		}

		const data = await refreshToken(token.refresh_token!);

		setAuthToken(data!.access_token!);
	} catch (e) {
		throw 'Error while trying to assure valid token: ' + e;
	}
};

export const getPlayerStatus = async () => {
	try {
		await assureValidToken();
		const { data } = await API.get<SpotifyPlayerStatus>('/me/player');

		const { device, item, progress_ms } = data;

		const isPlaying = device.is_active;
		const deviceName = device.name;
		const progress = progress_ms;
		const duration = item.duration_ms;
		const formattedDuration = formatTime(duration);
		const formattedProgress = formatTime(progress);
		const percent_played = (progress / duration) * 100;
		const artist = item.artists[0].name;
		const album = item.album.name;
		const songName = item.name;
		const songLink = item.external_urls.spotify;

		return {
			isPlaying,
			deviceName,
			progress,
			artist,
			album,
			songName,
			songLink,
			percent_played,
			formattedDuration,
			formattedProgress,
		};
	} catch (e) {
		console.warn('Error while trying to get player status: ' + e);
	}
};

export const formatTime = (milliseconds: number): string => {
	const totalSeconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

type SpotifyDevice = {
	id: string;
	is_active: boolean;
	is_private_session: boolean;
	is_restricted: boolean;
	name: string;
	supports_volume: boolean;
	type: string;
	volume_percent: number;
};

type SpotifyArtist = {
	external_urls: {
		spotify: string;
	};
	href: string;
	id: string;
	name: string;
	type: string;
	uri: string;
};

type SpotifyAlbum = {
	album_type: string;
	artists: SpotifyArtist[];
	available_markets: string[];
	external_urls: {
		spotify: string;
	};
	href: string;
	id: string;
	images: {
		height: number;
		url: string;
		width: number;
	}[];
	name: string;
	release_date: string;
	release_date_precision: string;
	total_tracks: number;
	type: string;
	uri: string;
};

type SpotifyTrack = {
	album: SpotifyAlbum;
	artists: SpotifyArtist[];
	available_markets: string[];
	disc_number: number;
	duration_ms: number;
	explicit: boolean;
	external_ids: {
		isrc: string;
	};
	external_urls: {
		spotify: string;
	};
	href: string;
	id: string;
	is_local: boolean;
	name: string;
	popularity: number;
	preview_url: string | null;
	track_number: number;
	type: string;
	uri: string;
};

type SpotifyContext = {
	external_urls: {
		spotify: string;
	};
	href: string;
	type: string;
	uri: string;
};

type SpotifyPlayerStatus = {
	device: SpotifyDevice;
	shuffle_state: boolean;
	smart_shuffle: boolean;
	repeat_state: string;
	timestamp: number;
	context: SpotifyContext;
	progress_ms: number;
	item: SpotifyTrack;
	currently_playing_type: string;
	actions: {
		disallows: {
			resuming: boolean;
		};
	};
	is_playing: true;
};
