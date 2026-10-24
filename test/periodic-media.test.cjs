const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { periodicMediaCatalog, createMediaProvider } = require('../dist/Services/PeriodicStatus/mediaCatalog');
const { createMediaSchedule, statusProviders, statusSchedule } = require('../dist/Services/PeriodicStatus/config');
const { validateSlots } = require('../dist/Services/PeriodicStatus/scheduler');
const { firstSeconds } = require('../dist/Services/PeriodicStatus/video');
const run = promisify(execFile);

test('maps every supplied filename to its local weekday and time, including daily midnight', () => {
 const destination = { kind: 'status', recipients: ['5511999999999@s.whatsapp.net'] };
 const schedule = createMediaSchedule([destination]);
 assert.equal(schedule.length, 14);
 validateSlots(schedule, statusProviders);
 assert.equal(statusSchedule.length, 14);
 assert.ok(statusSchedule.every(item => item.destinations.length === 1 && item.destinations[0].kind === 'status' && item.destinations[0].audience === 'all_contacts'));
 validateSlots(statusSchedule, statusProviders);
 assert.deepEqual(schedule.filter(item => item.statusId === 'everyday-midnight').map(item => [item.weekday, item.time]),
  Array.from({ length: 7 }, (_, weekday) => [weekday, '00:00']));
 assert.deepEqual(schedule.filter(item => item.statusId !== 'everyday-midnight').map(item => [item.weekday, item.time]),
  [[1, '12:00'], [2, '11:00'], [3, '16:00'], [4, '11:00'], [5, '10:00'], [6, '10:00'], [0, '23:18']]);
 assert.ok(schedule.every(item => item.destinations.every(target => target.kind === 'status')));
 assert.equal(periodicMediaCatalog.find(item => item.statusId === 'saturday-10am').trimToSeconds, 90);
});

test('loads image as base64 with its metadata and rejects unsafe/empty/missing files', async t => {
 const directory = await mkdtemp(path.join(os.tmpdir(), 'kozz-periodic-media-test-'));
 t.after(() => rm(directory, { recursive: true, force: true }));
 const bytes = Buffer.from('image-test');
 await writeFile(path.join(directory, 'monday-noon.png'), bytes);
 const result = await createMediaProvider('monday-noon.png', null, { directory })({});
 assert.deepEqual(Buffer.from(result.media.data, 'base64'), bytes);
 assert.equal(result.media.sizeInBytes, bytes.length);
 assert.equal(result.media.mimeType, 'image/png');
 assert.equal(result.media.transportType, 'b64');
 assert.equal(result.body, '');
 await assert.rejects(createMediaProvider('../file.png', null, { directory })({}), /inválido/);
 await assert.rejects(createMediaProvider('missing.png', null, { directory })({}));
 await writeFile(path.join(directory, 'empty.png'), Buffer.alloc(0));
 await assert.rejects(createMediaProvider('empty.png', null, { directory })({}), /vazia/);
});

test('creates only the requested opening clip while leaving original bytes unchanged', async t => {
 const directory = await mkdtemp(path.join(os.tmpdir(), 'kozz-periodic-clip-test-'));
 t.after(() => rm(directory, { recursive: true, force: true }));
 const source = path.join(directory, 'saturday-10AM.mp4');
 await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=64x64:rate=25',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '2', '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', source]);
 const original = await readFile(source);
 const result = await createMediaProvider('saturday-10AM.mp4', 2, { directory, trimToSeconds: 1 })({});
 assert.equal(result.media.duration, 1);
 const clip = path.join(directory, 'clip.mp4');
 await writeFile(clip, Buffer.from(result.media.data, 'base64'));
 const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,start_time', '-of', 'json', clip]);
 const info = JSON.parse(probe.stdout);
 assert.ok(Number(info.format.duration) <= 1.04);
 assert.ok(Number(info.format.duration) >= 0.96);
 assert.ok(info.streams.some(stream => stream.codec_type === 'video' && Number(stream.start_time) === 0));
 assert.ok(info.streams.some(stream => stream.codec_type === 'audio'));
 assert.deepEqual(await readFile(source), original);
 await assert.rejects(firstSeconds(source, 91), /inválida/);
});
