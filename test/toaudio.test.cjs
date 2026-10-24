const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const { extractAudio, MAX_VIDEO_BYTES } = require('../dist/Handlers/ToAudio/convert');
let directory, video, silent;
const media = data => ({ data: data.toString('base64'), transportType: 'b64', mimeType: 'video/mp4', duration: null, sizeInBytes: data.length });

before(async () => {
 directory = await fs.mkdtemp(path.join(tmpdir(), 'toaudio-test-'));
 const common = ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=10'];
 execFileSync('ffmpeg', [...common, '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.3', '-c:v', 'mpeg4', '-c:a', 'aac', path.join(directory, 'sound.mp4')]);
 execFileSync('ffmpeg', [...common, '-t', '0.3', '-c:v', 'mpeg4', path.join(directory, 'silent.mp4')]);
 video = await fs.readFile(path.join(directory, 'sound.mp4'));
 silent = await fs.readFile(path.join(directory, 'silent.mp4'));
});
after(async () => fs.rm(directory, { recursive: true, force: true }));

test('extracts real video as playable MP3 and cleans temporary conversion files', async () => {
 const before = (await fs.readdir(tmpdir())).filter(name => name.startsWith('kozz-toaudio-')).sort();
 const output = await extractAudio(media(video));
 const file = path.join(directory, 'audio.mp3');
 await fs.writeFile(file, output);
 const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file]));
 assert.equal(info.streams.length, 1);
 assert.equal(info.streams[0].codec_name, 'mp3');
 assert.deepEqual((await fs.readdir(tmpdir())).filter(name => name.startsWith('kozz-toaudio-')).sort(), before);
});
test('reports silent and corrupt videos', async () => {
 await assert.rejects(extractAudio(media(silent)), /não possui faixa de áudio/);
 await assert.rejects(extractAudio(media(Buffer.from('broken'))), /corrompido/);
});
test('rejects empty, oversized and overlong input', async () => {
 await assert.rejects(extractAudio(media(Buffer.alloc(0))), /vazio/);
 await assert.rejects(extractAudio({ ...media(video), sizeInBytes: MAX_VIDEO_BYTES + 1 }), /64 MB/);
 await assert.rejects(extractAudio({ ...media(video), duration: 601 }), /10 minutos/);
});
test('reports unavailable URL media', async () => {
 await assert.rejects(extractAudio({ ...media(video), transportType: 'url', data: 'file:///no-access' }), /baixar/);
});

function handler(convert = extractAudio) {
 const file = path.resolve(__dirname, '../dist/Handlers/ToAudio/index.js');
 const localRequire = createRequire(file);
 const exports = {};
 vm.runInNewContext(readFileSync(file, 'utf8'), {
  exports, process, Buffer,
  require: name => name === 'kozz-module-maker' ? {
   createMethod: (name, callback) => ({ [name]: callback }),
   createModule: options => ({ resources: { upsertResource: () => options } }),
  } : name === './convert' ? { extractAudio: convert, ToAudioError: require('../dist/Handlers/ToAudio/convert').ToAudioError } : localRequire(name),
 });
 return exports.startToAudioHandler().commands.methods.default;
}
function requester(quotedMessage) {
 const replies = [], sent = [], queries = [];
 const reply = value => replies.push(value);
 reply.withMedia = value => sent.push(value);
 return { message: { quotedMessage, boundaryId: 'zapo', from: 'user', chatId: 'group@g.us' }, reply,
  ask: { boundary: async (...args) => { queries.push(args); return { response: undefined }; } }, replies, sent, queries };
}
test('command requires quoted video and reports unavailable media', async () => {
 const run = handler();
 for (const quoted of [undefined, { messageType: 'TEXT' }, { id: 'expired', messageType: 'VIDEO' }]) {
  const req = requester(quoted);
  await run(req);
  assert.equal(req.sent.length, 0);
  assert.equal(req.replies.length, 1);
  if (quoted?.id) assert.deepEqual(req.queries[0].slice(0, 2), ['zapo', 'message_by_id']);
 }
});
test('command replies with an MP3 and prevents concurrent requests by same user', async () => {
 let release;
 const run = handler(() => new Promise(resolve => { release = resolve; }));
 const req = requester({ messageType: 'VIDEO', media: media(video) });
 const first = run(req);
 await run(req);
 assert.equal(req.replies.length, 2);
 release(Buffer.from('mp3'));
 await first;
 assert.equal(req.sent.length, 1);
 assert.equal(req.sent[0].mimeType, 'audio/mpeg');
 assert.equal(req.sent[0].fileName, 'audio.mp3');
});
