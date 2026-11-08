import { Help as DownloadHelp, Migration } from '../MediaDownload/messages';

export const Help = () => (
	<>
		<Migration />
		<DownloadHelp mode="video" />
		<DownloadHelp mode="audio" />
	</>
);
