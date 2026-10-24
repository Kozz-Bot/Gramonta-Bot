const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { useJsonDB } = require('../dist/Utils/StaticJsonDb');

test('a fresh local collection starts empty and persists its first entry', t => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kozz-local-db-'));
 t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
 const file = path.join(directory, 'collection.json');
 const db = useJsonDB('items', file);
 assert.deepEqual(db.getAllEntities(), []);
 db.addEntity({ id: 'first' });
 assert.deepEqual(useJsonDB('items', file).getAllEntities(), [{ id: 'first' }]);
});

test('existing runtime data is preserved and malformed JSON is not silently replaced', t => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kozz-local-db-'));
 t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
 const file = path.join(directory, 'collection.json');
 fs.writeFileSync(file, '{"items":[{"id":"existing"}]}');
 assert.deepEqual(useJsonDB('items', file).getAllEntities(), [{ id: 'existing' }]);
 fs.writeFileSync(file, '{invalid');
 assert.throws(() => useJsonDB('items', file).getAllEntities(), SyntaxError);
 assert.equal(fs.readFileSync(file, 'utf8'), '{invalid');
});
