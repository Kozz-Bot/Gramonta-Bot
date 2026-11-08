import { downloadYoutubeMedia, searchResults } from '../../API/YoutubeAPI';
import { downloadWithYtDlp, downloadWithCobalt } from './providers';
import { resolvePublicUrl } from './network';
import { prepareMedia } from './media';
import { DownloadError, DownloadMode, youtubeUrl } from './urls';

export const downloadMedia = async (query: string, mode: DownloadMode) => {
	let url: string;
	if (/^https:\/\//i.test(query)) url = await resolvePublicUrl(query);
	else {
		const result = (await searchResults(query))?.results[0];
		if (!result || !youtubeUrl(result.link))
			throw new DownloadError(
				'Não encontrei esse vídeo no YouTube. Tente outro nome ou cole o link.'
			);
		url = result.link;
	}
	if (youtubeUrl(url)) {
		// Cookies stay on the remote server. Never fall through to local providers.
		return prepareMedia(await downloadYoutubeMedia(url, mode), mode);
	}
	try {
		return await prepareMedia(await downloadWithYtDlp(url, mode), mode);
	} catch {
		console.info('[MediaDownload] primeira tentativa falhou; tentando Cobalt', {
			mode,
		});
		return prepareMedia(await downloadWithCobalt(url, mode), mode);
	}
};
