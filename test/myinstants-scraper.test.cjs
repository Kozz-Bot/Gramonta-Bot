const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFirstSound } = require('../dist/API/MyInstantsApi');

test('scrapes only the first MyInstants result', () => {
	const html = `
		<div id="instants_container">
			<div class="instant">
				<button class="small-button" onclick="play('/media/sounds/fah.mp3', 'loader-1')"></button>
				<p class="instant-link"> FAHHHH </p>
				<a href="/en/instant/fah-sound/"></a>
			</div>
			<div class="instant">
				<button class="small-button" onclick="play('/media/sounds/second.mp3', 'loader-2')"></button>
				<p class="instant-link">Second result</p>
			</div>
		</div>`;

	assert.deepEqual(parseFirstSound(html), {
		id: 'fah-sound',
		title: 'FAHHHH',
		mp3: 'https://www.myinstants.com/media/sounds/fah.mp3',
	});
});

test('supports MyInstants pages that use onmousedown for playback', () => {
	const html = `
		<div id="instants_container">
			<div class="instant">
				<button class="small-button" onmousedown="play('/media/sounds/fallback.mp3', 'loader-1')"></button>
				<p class="instant-link">Fallback sound</p>
			</div>
		</div>`;

	assert.deepEqual(parseFirstSound(html), {
		id: 'fallback.mp3',
		title: 'Fallback sound',
		mp3: 'https://www.myinstants.com/media/sounds/fallback.mp3',
	});
});

test('returns no sound when the first result is missing or invalid', () => {
	assert.equal(parseFirstSound('<div id="instants_container"></div>'), null);
	assert.equal(
		parseFirstSound(`
			<div id="instants_container">
				<div class="instant">
					<button class="small-button" onclick="play('https://example.com/sound.mp3', 'loader-1')"></button>
					<p class="instant-link">Unexpected host</p>
				</div>
			</div>`),
		null
	);
});
