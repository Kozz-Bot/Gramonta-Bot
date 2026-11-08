const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

exports.downloadHarness = download => {
	const cache = new Map();
	const load = relative => {
		const file = path.resolve(__dirname, '../../dist', relative);
		if (cache.has(file)) return cache.get(file);
		const exports = {};
		cache.set(file, exports);
		const localRequire = createRequire(file);
		vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
			exports,
			process,
			Buffer,
			URL,
			console,
			require: name => {
				if (name === 'kozz-module-maker')
					return {
						createMethod: (name, fn) => ({ [name]: fn }),
						createModule: options => ({
							resources: { upsertResource: () => options },
						}),
					};
				const resolved = localRequire.resolve(name);
				if (resolved.endsWith('/Services/MediaDownload/download.js'))
					return { downloadMedia: download };
				if (resolved.endsWith('/Handlers/MediaDownload/handler.js'))
					return load('Handlers/MediaDownload/handler.js');
				return localRequire(name);
			},
		});
		return exports;
	};
	return {
		social: platform =>
			load('Handlers/SocialVideo/handler.js').createSocialVideoHandler(
				platform,
				() => ''
			).commands.methods,
		youtube: () =>
			load('Handlers/Youtube/index.js').startYoutubeHandler().commands.methods,
		generic: mode =>
			load('Handlers/MediaDownload/handler.js').createDownloadHandler(mode).commands
				.methods,
	};
};
