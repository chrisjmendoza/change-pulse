const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ActivityModel, lineDelta } = require('../out/activity');

test('disjoint edits do not count untouched lines', () => {
  assert.deepEqual(lineDelta('a\nsame\nz', 'A\nsame\nZ'), { added: 2, removed: 2, changedLines: [0, 2] });
});
test('line endings, empty files, additions and deletion anchors', () => {
  assert.equal(lineDelta('a\r\nb\r\n', 'a\nb\n').added, 0);
  assert.equal(lineDelta('', 'a\nb\n').added, 2);
  assert.deepEqual(lineDelta('a\nb\nc', 'a\nc'), { added: 0, removed: 1, changedLines: [1] });
  assert.deepEqual(lineDelta('a', ''), { added: 0, removed: 1, changedLines: [0] });
  assert.deepEqual(lineDelta('a\nb', 'a'), { added: 0, removed: 1, changedLines: [0] });
});
test('repeated edits, duplicates and undo use a fixed baseline', () => {
  const model = new ActivityModel(); model.seed('file', 'old');
  model.update('file', 'new', true, false, 100);
  model.update('file', 'newer', true, false, 2000);
  const entry = model.entries.get('file');
  assert.equal(entry.delta.added, 1); assert.equal(entry.delta.removed, 1);
  assert.equal(entry.activeUntil, 4200);
  model.update('file', 'newer', true, false, 2100);
  assert.equal(model.entries.get('file'), entry);
  model.update('file', 'old', true, false, 2200);
  assert.equal(model.entries.get('file').delta.added, 0);
  assert.equal(model.entries.get('file').delta.removed, 0);
  assert.equal(model.entries.get('file').touched, true);
});
test('clear rebases surviving files and forgets deletions', () => {
  const model = new ActivityModel(); model.seed('file', 'old'); model.seed('deleted', 'a');
  model.update('file', 'new', true, false, 0); model.update('deleted', '', false, false, 0);
  model.clear();
  assert.equal(model.entries.get('file').touched, false);
  assert.equal(model.entries.has('deleted'), false);
  model.update('file', 'new\nmore', true, false, 100);
  assert.equal(model.entries.get('file').delta.added, 1);
  assert.equal(model.entries.get('file').delta.removed, 0);
});
test('new files start empty; missing pre-edit baselines are explicitly unknown', () => {
  const model = new ActivityModel();
  model.update('new', 'a\nb', true, true, 0);
  assert.equal(model.entries.get('new').delta.added, 2);
  model.update('unknown', 'a', true, false, 0);
  model.update('unknown', 'b', true, false, 1);
  assert.equal(model.entries.get('unknown').delta, undefined);
  model.clear(); model.update('unknown', 'c', true, false, 2);
  assert.equal(model.entries.get('unknown').delta.removed, 1);
});
test('tracking budgets reject growth without corrupting the previous baseline', () => {
  const model = new ActivityModel(2200, 1, 16);
  assert.equal(model.seed('a', 'a'), true);
  assert.equal(model.seed('b', 'b'), false);
  assert.equal(model.update('a', 'x'.repeat(20), true, false, 0), false);
  assert.equal(model.entries.get('a').current, 'a');
  model.remove('a'); assert.equal(model.seed('b', 'b'), true);
});
test('expensive diffs return unavailable instead of fabricated counts', () => {
  assert.equal(lineDelta(Array.from({length: 5000}, (_, i) => `a${i}`).join('\n'),
    Array.from({length: 5000}, (_, i) => `b${i}`).join('\n')), undefined);
});
