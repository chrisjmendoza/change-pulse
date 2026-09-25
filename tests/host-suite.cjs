const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function until(check, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (check()) { return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
}

exports.run = async () => {
  const manifest = require('../package.json');
  const extension = vscode.extensions.getExtension(manifest.publisher + '.' + manifest.name);
  assert.ok(extension);
  const tracker = await extension.activate(); await tracker.ready;
  const workspace = process.env.CHANGE_PULSE_TEST_WORKSPACE;
  const file = path.join(workspace, 'activity.txt'); const uri = vscode.Uri.file(file);
  const get = () => tracker.model.entries.get(uri.toString());
  assert.equal(get().current, 'before\nsame\nlast\n');
  assert.equal(vscode.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString()), false);
  await fs.writeFile(file, 'after\nsame\nLAST\n');
  await until(() => get().touched && get().current.startsWith('after'), 'unopened file watcher');
  assert.equal(get().delta.added, 2); assert.equal(get().delta.removed, 2);
  assert.match(tracker.getTreeItem(get()).description, /\+2 \/ −2/);
  assert.ok(tracker.provideFileDecoration(uri));
  await fs.writeFile(file, 'again\nsame\nLAST\n');
  await until(() => get().current.startsWith('again'), 'repeated agent write');
  assert.equal(get().delta.added, 2);
  await vscode.commands.executeCommand('workbench.view.scm');
  await vscode.commands.executeCommand('changePulse.activity.focus');
  await vscode.commands.executeCommand('file-change-flash.clearChanges');
  assert.equal(tracker.getChildren().length, 0);
  assert.equal(tracker.provideFileDecoration(uri), undefined);
  await fs.writeFile(file, 'again\nsame\nLAST\nextra\n');
  await until(() => get().delta?.added === 1, 'rebased net count');
  assert.equal(get().delta.removed, 0);
  await until(() => !tracker.provideFileDecoration(uri), 'pulse expiry');
  // Exercise real editor events alongside disk watcher events.
  const document = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit(); edit.insert(uri, new vscode.Position(0, 0), 'typed ');
  await vscode.workspace.applyEdit(edit);
  await until(() => get().current.startsWith('typed '), 'unsaved editor event');
  const delta = { added: get().delta.added, removed: get().delta.removed };
  await document.save();
  await new Promise(resolve => setTimeout(resolve, 750));
  assert.deepEqual({ added: get().delta.added, removed: get().delta.removed }, delta);
  const created = path.join(workspace, `created-${Date.now()}.txt`); const createdUri = vscode.Uri.file(created);
  await fs.writeFile(created, 'new\n');
  await until(() => tracker.model.entries.get(createdUri.toString())?.touched, 'file creation');
  assert.equal(tracker.model.entries.get(createdUri.toString()).delta.added, 1);
  await fs.unlink(created);
  await until(() => tracker.model.entries.get(createdUri.toString())?.exists === false, 'file deletion');
  console.log('REAL HOST PASS: unopened edits, inline counters, repeated writes, reset, expiry, dirty editor/save, create/delete, SCM view commands.');
};
