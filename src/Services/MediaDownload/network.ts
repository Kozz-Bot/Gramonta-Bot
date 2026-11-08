import axios from 'axios';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { publicAddress, publicUrl, youtubeUrl, DownloadError } from './urls';

// Every socket resolves only public IPv4 addresses, including redirected requests.
const guardedLookup: import('node:net').LookupFunction = (
	host,
	options,
	callback
) => {
	publicAddress(host).then(
		address => {
			if (options.all) (callback as any)(null, [{ address, family: 4 }]);
			else callback(null, address, 4);
		},
		error => callback(error, '', 4)
	);
};
export const publicHttp = axios.create({
	proxy: false,
	httpAgent: new http.Agent({ lookup: guardedLookup }),
	httpsAgent: new https.Agent({ lookup: guardedLookup }),
	maxRedirects: 0,
	timeout: 15000,
});

export const resolvePublicUrl = async (input: string): Promise<string> => {
	let current = publicUrl(input).href;
	for (let hop = 0; hop < 6; hop++) {
		if (youtubeUrl(current)) return current;
		const response = await publicHttp.get(current, {
			responseType: 'stream',
			validateStatus: () => true,
			headers: { 'User-Agent': 'Mozilla/5.0' },
		});
		response.data.destroy();
		if (
			response.status < 300 ||
			response.status >= 400 ||
			!response.headers.location
		)
			return current;
		current = publicUrl(new URL(response.headers.location, current).href).href;
	}
	throw new DownloadError(
		'Esse link redirecionou vezes demais. Cole o link direto.'
	);
};

export const fetchPublicMedia = async (
	input: string,
	maxBytes: number
): Promise<Buffer> => {
	const url = await resolvePublicUrl(input);
	const response = await publicHttp.get(url, {
		responseType: 'arraybuffer',
		maxContentLength: maxBytes,
	});
	return Buffer.from(response.data);
};

// yt-dlp extractors can follow their own URLs. Keep their entire HTTP traffic
// behind a temporary public-only proxy, preventing access to local services.
export const downloadProxy = async () => {
	const sockets = new Set<net.Socket>();
	const check = async (input: string) => {
		const url = publicUrl(input, true);
		if (youtubeUrl(url.href) || /(?:^|\.)googlevideo\.com$/.test(url.hostname))
			throw new DownloadError(
				'Use o link direto do YouTube para baixar pela API remota.'
			);
		return { url, address: await publicAddress(url.hostname) };
	};
	const server = http.createServer(async (req, res) => {
		try {
			const { url, address } = await check(req.url || '');
			if (url.protocol !== 'http:') throw new Error();
			const upstream = http.request(
				url,
				{
					method: req.method,
					headers: { ...req.headers, host: url.host },
					lookup: (_host, options, callback) => {
						if (options.all) (callback as any)(null, [{ address, family: 4 }]);
						else callback(null, address, 4);
					},
					timeout: 15000,
				},
				response => {
					res.writeHead(response.statusCode || 502, response.headers);
					response.pipe(res);
				}
			);
			upstream.on('socket', socket => sockets.add(socket));
			upstream.on('timeout', () => upstream.destroy());
			upstream.on('error', () => {
				if (!res.headersSent) res.writeHead(502);
				res.end();
			});
			req.pipe(upstream);
		} catch {
			res.writeHead(403).end();
		}
	});
	server.on('connection', socket => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
	});
	server.on('connect', async (req, client, head) => {
		try {
			const target = req.url || '';
			if (!target.endsWith(':443')) throw new Error();
			const { address } = await check(`https://${target.slice(0, -4)}`);
			if (client.destroyed) return;
			const upstream = net.connect(443, address);
			sockets.add(upstream);
			upstream.on('close', () => sockets.delete(upstream));
			upstream.setTimeout(20000, () => upstream.destroy());
			upstream.on('connect', () => {
				client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				if (head.length) upstream.write(head);
				upstream.pipe(client);
				client.pipe(upstream);
			});
			upstream.on('error', () => client.destroy());
			client.on('error', () => upstream.destroy());
			client.on('close', () => upstream.destroy());
		} catch {
			client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	return {
		url: `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`,
		close: () => {
			for (const socket of sockets) socket.destroy();
			server.close();
		},
	};
};
