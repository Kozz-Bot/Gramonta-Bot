#!/usr/bin/env node

/**
 * One-shot sender for Campanha_Catharina.jpeg.
 *
 * Expected format for ../disparos.txt:
 *
 * [MENSAGEM]
 * Texto que acompanhará a imagem.
 * [/MENSAGEM]
 *
 * Nome\t(11)99999-9999
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const mime = require('mime-types');
const { createModule } = require('kozz-module-maker');

const SCRIPT_DIR = __dirname;
const PROJECT_DIR = path.resolve(SCRIPT_DIR, '..');
const LIST_PATH = path.join(PROJECT_DIR, 'disparos.txt');
const IMAGE_PATH = path.join(
	PROJECT_DIR,
	'media/saved/Campanha_Catharina.jpeg'
);
const TEST_RECIPIENT = '5511947952409';
const SUPPORTED_BOUNDARIES = new Set(['kozz-baileys', 'kozz-zapo']);
const DEFAULT_BOUNDARY = process.env.CAMPAIGN_BOUNDARY || 'kozz-baileys';
const PAUSE_BETWEEN_SENDS_MS = 2_000;

const usage = () => {
	console.log(`Uso:
  npm run campaign:catharina                 # envia somente para ${TEST_RECIPIENT}
  npm run campaign:catharina -- --boundary kozz-zapo
  npm run campaign:catharina -- --all --confirm-all --boundary kozz-baileys
  npm run campaign:catharina -- --all --confirm-all --start-at=15 --boundary kozz-zapo

Variáveis opcionais:
  CAMPAIGN_BOUNDARY=kozz-baileys|kozz-zapo   # padrão: ${DEFAULT_BOUNDARY}
  CAMPAIGN_TEST_RECIPIENT=<DDD+número>       # sobrescreve o destinatário de teste`);
};

const readCampaign = async () => {
	const raw = await fs.readFile(LIST_PATH, 'utf8');
	const messageMatch = raw.match(/\[MENSAGEM\]\s*\r?\n([\s\S]*?)\r?\n?\[\/MENSAGEM\]/i);

	if (!messageMatch?.[1].trim()) {
		throw new Error(
			'Corpo da campanha ausente em disparos.txt. Adicione-o entre [MENSAGEM] e [/MENSAGEM].'
		);
	}

	const recipientText = raw.replace(messageMatch[0], '');
	const recipients = [...recipientText.matchAll(/(?:\+?55)?\D*(\d{2})\D*(\d{4,5})\D*(\d{4})(?!\d)/g)]
		.map(([, ddd, first, last]) => `55${ddd}${first}${last}`)
		.filter((number, index, all) => all.indexOf(number) === index);

	if (!recipients.length) {
		throw new Error('Nenhum telefone brasileiro válido foi encontrado em disparos.txt.');
	}

	return { message: messageMatch[1].trim(), recipients };
};

const createImageMedia = async () => {
	const data = await fs.readFile(IMAGE_PATH, 'base64url');
	const fileName = path.basename(IMAGE_PATH);

	return {
		data,
		fileName,
		mimeType: mime.lookup(fileName) || 'image/jpeg',
		sizeInBytes: Buffer.byteLength(data, 'base64url'),
		stickerTags: [],
		transportType: 'b64',
		duration: null,
	};
};

const normalizePhone = value => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '55');

const optionValue = (args, name) => {
	const equalsArg = args.find(arg => arg.startsWith(`${name}=`));
	if (equalsArg) return equalsArg.slice(name.length + 1);
	const index = args.indexOf(name);
	return index === -1 ? undefined : args[index + 1];
};

const main = async () => {
	const args = process.argv.slice(2);
	const argSet = new Set(args);
	if (argSet.has('--help') || argSet.has('-h')) {
		usage();
		return;
	}

	const sendToAll = argSet.has('--all');
	const startAtValue = optionValue(args, '--start-at');
	const startAt = startAtValue === undefined ? 0 : Number(startAtValue);
	const requestedBoundary = optionValue(args, '--boundary');
	if (argSet.has('--boundary') && !requestedBoundary) {
		throw new Error('--boundary exige kozz-baileys ou kozz-zapo.');
	}
	const boundary = requestedBoundary || DEFAULT_BOUNDARY;
	if (sendToAll && !argSet.has('--confirm-all')) {
		throw new Error('Envio total exige os parâmetros --all --confirm-all.');
	}
	if (!Number.isInteger(startAt) || startAt < 0) {
		throw new Error('--start-at deve ser um número inteiro maior ou igual a zero.');
	}
	if (startAt && !sendToAll) {
		throw new Error('--start-at só pode ser usado com --all.');
	}
	if (!SUPPORTED_BOUNDARIES.has(boundary)) {
		throw new Error(`Boundary inválida: ${boundary}. Use kozz-baileys ou kozz-zapo.`);
	}

	if (!process.env.GATEWAY_URL) {
		throw new Error('GATEWAY_URL não foi configurada. Execute pelo npm script, que carrega .env.');
	}

	const [{ message, recipients }, media] = await Promise.all([
		readCampaign(),
		createImageMedia(),
	]);
	const testRecipient = normalizePhone(
		process.env.CAMPAIGN_TEST_RECIPIENT || TEST_RECIPIENT
	);
	const targets = sendToAll ? recipients.slice(startAt) : [testRecipient];
	if (!targets.length) {
		throw new Error('Não há destinatários restantes a partir de --start-at.');
	}

	if (!/^55\d{10,11}$/.test(testRecipient)) {
		throw new Error('CAMPAIGN_TEST_RECIPIENT deve ter código do país, DDD e número.');
	}

	console.log(
		`Campanha pronta: ${targets.length} destinatário(s), boundary ${boundary}.`
	);

	const campaign = createModule({
		name: `campaign-catharina-${Date.now()}`,
		address: process.env.GATEWAY_URL,
		customSocketPath: process.env.SOCKET_PATH,
	});

	campaign.socket.once('connect_error', error => {
		console.error(`Falha ao conectar ao gateway: ${error.message}`);
		process.exitCode = 1;
	});

	campaign.socket.once('connect', async () => {
		try {
			for (const [index, recipient] of targets.entries()) {
				campaign.sendMessage.withMedia(
					`${recipient}@s.whatsapp.net`,
					boundary,
					message,
					media
				);
				console.log(`Envio ${index + 1}/${targets.length} encaminhado para ${recipient}.`);

				if (index < targets.length - 1) {
					await new Promise(resolve => setTimeout(resolve, PAUSE_BETWEEN_SENDS_MS));
				}
			}
		} catch (error) {
			console.error(error);
			process.exitCode = 1;
		} finally {
			setTimeout(() => campaign.socket.disconnect(), 1_000);
		}
	});
};

main().catch(error => {
	console.error(error.message);
	process.exitCode = 1;
});
