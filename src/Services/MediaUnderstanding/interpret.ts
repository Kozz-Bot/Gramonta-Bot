import type { Media } from 'kozz-types';
import FuelIXApi, { LlmContentPart } from '../../API/FuelIXApi';
import { getTemporaryCdnMediaUrl } from '../../API/TemporaryCdnMedia';
import { MediaWindow, prepareMedia } from './convert';
import { AiToolInputError } from '../OwnerAI/contracts';

export const interpretMedia = async (media: Media, window: MediaWindow = {}) => {
	const prepared = await prepareMedia(media, window);
	try {
		let transcript = '',
			audioUnavailable = false;
		if (prepared.audioPath) {
			try {
				transcript = (
					await FuelIXApi.transcribeFile(prepared.audioPath)
				).alternatives[0].transcript.slice(0, 12000);
			} catch {
				audioUnavailable = true;
			}
		}
		const parts: LlmContentPart[] = [],
			frameTimes: number[] = [];
		let visualUnavailable = false;
		for (const frame of prepared.frames) {
			try {
				const url = await getTemporaryCdnMediaUrl(
					{
						data: frame.bytes.toString('base64'),
						transportType: 'b64',
						mimeType: 'image/jpeg',
						fileName: 'quadro.jpg',
						sizeInBytes: frame.bytes.length,
						duration: 0,
						stickerTags: [],
					},
					'ai-media-frame'
				);
				parts.push(
					{
						type: 'text',
						text:
							prepared.kind === 'video'
								? `Quadro do vídeo em ${frame.seconds.toFixed(3)} segundos:`
								: 'Imagem da mensagem:',
					},
					{ type: 'image_url', image_url: url }
				);
				frameTimes.push(frame.seconds);
			} catch {
				visualUnavailable = true;
				break;
			}
		}
		if (!parts.length && (!prepared.audioPath || audioUnavailable))
			throw new AiToolInputError(
				'Não consegui disponibilizar a imagem ou transcrever o áudio. Tente novamente ou reenvie o arquivo.'
			);
		const summary = {
			kind: prepared.kind,
			durationSeconds: prepared.duration,
			analyzedStartSeconds: prepared.start,
			analyzedEndSeconds: prepared.end,
			partial: prepared.partial || visualUnavailable || audioUnavailable,
			sampledFrames: frameTimes.length,
			frameTimesSeconds: frameTimes,
			visual: visualUnavailable
				? frameTimes.length
					? 'partially_unavailable'
					: 'unavailable'
				: frameTimes.length
					? 'sampled'
					: 'not_applicable',
			transcript: transcript || undefined,
			audio: audioUnavailable
				? 'transcription_unavailable'
				: prepared.noAudio
					? 'no_audio_track'
					: prepared.audioPath
						? transcript
							? 'transcribed'
							: 'no_speech_detected'
						: 'not_applicable',
			limitation:
				prepared.kind === 'video'
					? 'Amostras visuais do trecho, não todos os quadros. Ações rápidas podem não aparecer. Horários são do arquivo original. A transcrição cobre o trecho de áudio, sem alinhamento palavra a palavra.'
					: undefined,
		};
		return { summary, parts };
	} finally {
		await prepared.cleanup();
	}
};
