const { test } = require('node:test');
const assert = require('node:assert/strict');
const { host } = require('./host-mock.cjs');

test('unopened external edits appear with inline net counts and renewable activity', async () => {
  const h = host({ 'a.txt': 'before' }); await h.tracker.ready;
  h.write('a.txt', 'after'); await h.tracker.flush();
  const entry = h.tracker.getChildren()[0];
  assert.match(h.tracker.getTreeItem(entry).description, /\+1 \/ −1.*active/);
  assert.ok(h.tracker.provideFileDecoration(h.uri('a.txt')).badge.length <= 2);
  h.tick(2900); h.write('a.txt', 'again'); await h.tracker.flush();
  h.tick(3300); assert.ok(h.tracker.provideFileDecoration(h.uri('a.txt')));
  h.tick(5200); assert.equal(h.tracker.provideFileDecoration(h.uri('a.txt')), undefined);
  assert.equal(h.tracker.getChildren()[0].delta.added, 1);
  h.tracker.dispose();
});
test('pulse alternates and clear invalidates decorations and rebases counts', async () => {
  const h = host({ 'a.txt': 'old' }); await h.tracker.ready;
  h.write('a.txt', 'new'); await h.tracker.flush();
  const badge = h.tracker.provideFileDecoration(h.uri('a.txt')).badge;
  h.tick(1350); assert.notEqual(h.tracker.provideFileDecoration(h.uri('a.txt')).badge, badge);
  let invalidations = 0; h.tracker.onDidChangeFileDecorations(() => invalidations++);
  await h.clear(); assert.ok(invalidations); assert.equal(h.tracker.getChildren().length, 0);
  assert.equal(h.tracker.provideFileDecoration(h.uri('a.txt')), undefined);
  h.write('a.txt', 'new\nextra'); await h.tracker.flush();
  assert.equal(h.tracker.getChildren()[0].delta.removed, 0);
  h.tracker.dispose();
});
test('create, delete, atomic replacement, and duplicate saves', async () => {
  const h = host({ 'a.txt': 'old' }); await h.tracker.ready;
  h.write('new.txt', 'one\ntwo', 'create'); await h.tracker.flush();
  assert.equal(h.tracker.model.entries.get(h.uri('new.txt').toString()).delta.added, 2);
  h.events.delete.fire(h.uri('a.txt')); h.write('a.txt', 'replacement', 'create'); await h.tracker.flush();
  const entry = h.tracker.model.entries.get(h.uri('a.txt').toString());
  assert.equal(entry.delta.removed, 1);
  h.events.change.fire(h.uri('a.txt')); await h.tracker.flush();
  assert.equal(h.tracker.model.entries.get(entry.key), entry);
  h.files.delete(entry.key); h.events.delete.fire(h.uri('a.txt')); await h.tracker.flush();
  const deleted = h.tracker.model.entries.get(entry.key);
  assert.equal(deleted.delta.removed, 1); assert.equal(deleted.exists, false);
  assert.equal(h.tracker.getTreeItem(deleted).command, undefined);
  h.tracker.dispose();
});
test('folder-only notifications track child deletions and newly created files', async () => {
  const h = host({ 'dir/a.txt': 'old' }); await h.tracker.ready;
  h.files.clear(); h.events.delete.fire(h.uri('dir')); await h.tracker.flush();
  assert.equal(h.tracker.getChildren()[0].exists, false);
  h.files.set(h.uri('new/a.txt').toString(), 'new'); h.events.create.fire(h.uri('new'));
  await h.tracker.flush(); await h.tracker.flush();
  assert.equal(h.tracker.model.entries.get(h.uri('new/a.txt').toString()).delta.added, 1);
  h.tracker.dispose();
});
test('remote URIs are preserved; excluded and binary files do not produce counters', async () => {
  const h = host({ 'a.txt': 'old', 'node_modules/a.txt': 'x', 'binary.dat': '\0bad' }, 'vscode-remote://ssh-remote+host/workspace');
  await h.tracker.ready; h.write('a.txt', 'new'); await h.tracker.flush();
  assert.equal(h.tracker.model.entries.size, 1);
  const item = h.tracker.getTreeItem(h.tracker.getChildren()[0]);
  assert.equal(item.command.arguments[0].toString(), h.uri('a.txt').toString());
  h.tracker.dispose();
});
test('dirty editor takes priority over disk; save does not double count; deletion highlights survive tab switches', async () => {
  const h = host({ 'a.txt': 'a\nb' }); await h.tracker.ready;
  const doc = h.document('a.txt', 'a'); h.events.document.fire({ document: doc, contentChanges: [{}] });
  h.events.change.fire(h.uri('a.txt')); await h.tracker.flush();
  assert.equal(h.tracker.getChildren()[0].current, 'a');
  let ranges; h.editors.push({ document: doc, setDecorations: (_, value) => { ranges = value; } });
  h.events.visible.fire(); assert.equal(ranges[0].line, 0);
  const before = h.tracker.getChildren()[0];
  doc.isDirty = false; h.write('a.txt', 'a'); await h.tracker.flush();
  assert.equal(h.tracker.getChildren()[0], before);
  await h.clear(); assert.equal(ranges.length, 0); h.tracker.dispose();
});
test('a stale asynchronous disk read cannot overwrite a newer editor event', async () => {
  const h = host({ 'a.txt': 'old' }); await h.tracker.ready;
  const doc = h.document('a.txt', 'old');
  const originalRead = h.api.workspace.fs.readFile;
  let release; h.api.workspace.fs.readFile = () => {
    h.api.workspace.fs.readFile = originalRead;
    return new Promise(resolve => { release = resolve; });
  };
  h.events.change.fire(h.uri('a.txt')); const pending = h.tracker.flush();
  await new Promise(resolve => setImmediate(resolve));
  doc.text = 'newest'; h.events.document.fire({ document: doc, contentChanges: [{}] });
  release(Buffer.from('stale')); await pending;
  assert.equal(h.tracker.getChildren()[0].current, 'newest'); h.tracker.dispose();
});
test('dispose stops timers and registered resources', async () => {
  const h = host({ 'a.txt': 'old' }); await h.tracker.ready;
  h.tracker.dispose(); assert.equal(h.timerCleared(), true);
  // Host-owned input emitters are not extension resources.
  assert.ok(h.resources.slice(8).every(resource => resource.disposed));
  h.write('a.txt', 'new'); await h.tracker.flush(); assert.equal(h.tracker.getChildren().length, 0);
});

test('workspace parent names do not trigger relative exclusions', async () => {
  const h = host({ 'a.txt': 'old' }, 'file:///build/project'); await h.tracker.ready;
  h.write('a.txt', 'new'); await h.tracker.flush();
  assert.equal(h.tracker.getChildren()[0].delta.added, 1); h.tracker.dispose();
});

test('clear drains folder discovery before establishing the new baseline', async () => {
  const h = host(); await h.tracker.ready;
  h.files.set(h.uri('new/a.txt').toString(), 'new'); h.events.create.fire(h.uri('new'));
  await h.clear(); assert.equal(h.tracker.getChildren().length, 0);
  h.write('new/a.txt', 'new\nextra'); await h.tracker.flush();
  assert.equal(h.tracker.getChildren()[0].delta.added, 1);
  assert.equal(h.tracker.getChildren()[0].delta.removed, 0); h.tracker.dispose();
});
