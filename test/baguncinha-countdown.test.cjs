const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEADLINE, HOUR, FINAL_SUBJECT, subjectAt, updateBaguncinha, runCountdown } = require('../dist/Services/BaguncinhaCountdown/countdown');

test('uses Brasília deadline and rounds remaining hours upward', () => {
 assert.equal(new Date(DEADLINE).toISOString(), '2026-10-25T20:00:00.000Z');
 assert.equal(subjectAt(DEADLINE - HOUR - 1), 'Baguncinha: 2 hora para enterrar o PT');
 assert.equal(subjectAt(DEADLINE - HOUR), 'Baguncinha: 1 hora para enterrar o PT');
 assert.equal(subjectAt(DEADLINE - 1), 'Baguncinha: 1 hora para enterrar o PT');
 assert.equal(subjectAt(DEADLINE), FINAL_SUBJECT);
 assert.equal(subjectAt(DEADLINE + HOUR), FINAL_SUBJECT);
});

test('renames only the matching group and skips an unchanged name', async () => {
 const calls = [];
 const now = () => DEADLINE - HOUR;
 const ask = async (resource, payload) => {
  calls.push([resource, payload]);
  return resource === 'all_groups' ? [{ id: '1@g.us', name: 'Baguncinha antiga' }, { id: '2@g.us', name: 'Outro' }] : { updated: true };
 };
 assert.equal(await updateBaguncinha(ask, now), false);
 assert.deepEqual(calls[1], ['group_set_subject', { chatId: '1@g.us', subject: subjectAt(now()) }]);
 await updateBaguncinha(async resource => {
  assert.equal(resource, 'all_groups');
  return [{ id: '1@g.us', name: subjectAt(now()) }];
 }, now);
});

test('rejects absent, ambiguous, invalid and unavailable groups', async () => {
 for (const groups of [undefined, [], [{ id: '1@lid', name: 'Baguncinha' }], [{ id: '1@g.us', name: 'Baguncinha' }, { id: '2@g.us', name: 'Baguncinha 2' }]]) {
  await assert.rejects(updateBaguncinha(async resource => {
   assert.equal(resource, 'all_groups');
   return groups;
  }, Date.now));
 }
});

test('stops scheduling only after final rename succeeds, including after restart', async () => {
 for (const name of ['Baguncinha', FINAL_SUBJECT]) {
  let completed = false;
  let renames = 0;
  await runCountdown(async resource => {
   if (resource === 'all_groups') return [{ id: '1@g.us', name }];
   renames++;
   return { updated: true };
  }, () => { completed = true; }, {
   now: () => DEADLINE,
   schedule: () => assert.fail('must not schedule after completion'),
  });
  assert.equal(completed, true);
  assert.equal(renames, name === FINAL_SUBJECT ? 0 : 1);
 }
});

test('retries a failed final rename and aligns successful updates to the hour', async () => {
 let retry;
 let renamed = false;
 let completed = false;
 let now = DEADLINE;
 await runCountdown(async resource => {
  if (resource === 'all_groups') return [{ id: '1@g.us', name: 'Baguncinha' }];
  return { updated: renamed };
 }, () => { completed = true; }, {
  now: () => now,
  schedule: (callback, delay) => { retry = callback; assert.equal(delay, 60_000); },
 });
 assert.equal(completed, false);
 renamed = true;
 retry();
 await new Promise(setImmediate);
 assert.equal(completed, true);
 now = DEADLINE - HOUR - 1234;
 await runCountdown(async resource => resource === 'all_groups' ? [{ id: '1@g.us', name: subjectAt(now) }] : assert.fail(), () => assert.fail(), {
  now: () => now,
  schedule: (_, delay) => assert.equal(delay, 1234),
 });
});
