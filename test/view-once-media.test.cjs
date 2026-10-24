const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { recoverViewOnceMedia } = require('../dist/Utils/ViewOnceMedia');

const media = { data: 'dGVzdA==', mimeType: 'image/jpeg', transportType: 'b64' };
function requester(responses = []) {
 const queries = [], sends = [];
 return {
  message: { id: 'once', boundaryId: 'receiving-boundary', chatId: 'source@g.us', to: 'source@g.us', isViewOnce: true, contact: { id: 'sender@lid', publicName: 'Sender' }, body: '' },
  ask: { boundary: async (...args) => { queries.push(args); return { response: responses.shift() }; } },
  sendMessage: { withMedia: async (...args) => sends.push(args) }, queries, sends,
 };
}
function archive() {
 const file = path.resolve(__dirname, '../dist/Proxies/MediaArchive/index.js');
 const localRequire = createRequire(file);
 const exports = {};
 vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
  exports, process, console,
  require: name => name === 'kozz-module-maker' ? { createModule: options => options } : localRequire(name),
 }, { filename: file });
 return exports.createMediaArchive().proxy.onMessage;
}

test('proxy recovers view-once media from the receiving boundary cache', async () => {
 const req = requester([{ media }]);
 await archive()(req);
 assert.deepEqual(req.queries, [['receiving-boundary', 'cached_message_by_id', { messageId: 'once', chatId: 'source@g.us' }]]);
 assert.equal(req.sends.length, 1);
 assert.equal(req.sends[0][2], media);
});

test('cache miss falls back to full retrieval and uses the quoted message ID', async () => {
 const req = requester([undefined, { media }]);
 const quoted = { ...req.message, id: 'quoted' };
 assert.equal(await recoverViewOnceMedia(req, quoted), media);
 assert.equal(req.queries[1][1], 'message_by_id');
 assert.equal(req.queries[1][2].messageId, 'quoted');
});

test('already downloaded media is forwarded without a lookup', async () => {
 const req = requester();req.message.media = media;
 await archive()(req);
 assert.equal(req.queries.length, 0);
 assert.equal(req.sends[0][2], media);
});

test('unavailable or expired media is not passed to the send routine', async () => {
 const req = requester();
 await archive()(req);
 assert.equal(req.queries.length, 2);
 assert.equal(req.sends.length, 0);
});

test('proxy ignores ordinary media and its own destination to prevent loops', async () => {
 const req = requester([{ media }]);req.message.isViewOnce = false;
 await archive()(req);
 req.message.isViewOnce = true;req.message.chatId = '120363410507112099@g.us';
 await archive()(req);
 assert.equal(req.queries.length, 0);
 assert.equal(req.sends.length, 0);
});
