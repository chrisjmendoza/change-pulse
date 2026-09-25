const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

exports.host = function(initial = {}, root = 'file:///workspace') {
  const files = new Map(Object.entries(initial).map(([name, text]) => [`${root}/${name}`, text]));
  const resources = [];
  const disposable = () => { const value = { disposed: false, dispose() { this.disposed = true; } }; resources.push(value); return value; };
  class Emitter {
    listeners = []; disposed = false; fired = 0;
    constructor() { resources.push(this); }
    event = callback => { this.listeners.push(callback); return disposable(); };
    fire(value) { this.fired++; if (!this.disposed) { for (const callback of this.listeners) { callback(value); } } }
    dispose() { this.disposed = true; this.listeners = []; }
  }
  const events = Object.fromEntries(['create', 'change', 'delete', 'document', 'open', 'close', 'folders', 'visible'].map(key => [key, new Emitter()]));
  const parse = value => ({ path: new URL(value).pathname, toString: () => value });
  const commands = new Map(); const documents = []; const editors = [];
  const missing = () => Object.assign(new Error('missing'), { code: 'FileNotFound' });
  let now = 1000; let tick; let timerCleared = false;
  const view = disposable();
  const api = {
    Uri: { parse }, FileType: { File: 1, Directory: 2 },
    RelativePattern: class { constructor(base, pattern) { this.baseUri = base; this.pattern = pattern; } },
    EventEmitter: Emitter,
    CancellationTokenSource: class { token = {}; cancel() {} dispose() {} },
    ThemeColor: class { constructor(id) { this.id = id; } },
    ThemeIcon: class { constructor(id, color) { Object.assign(this, { id, color }); } },
    TreeItem: class { constructor(label) { this.label = label; } },
    OverviewRulerLane: { Right: 4 },
    window: {
      createTextEditorDecorationType: disposable,
      createTreeView: () => view,
      registerFileDecorationProvider: disposable,
      visibleTextEditors: editors,
      onDidChangeVisibleTextEditors: events.visible.event
    },
    workspace: {
      textDocuments: documents,
      getWorkspaceFolder: uri => uri.toString().startsWith(root + '/') ? { uri: parse(root) } : undefined,
      asRelativePath: uri => uri.toString().slice(root.length + 1),
      findFiles: async (pattern) => [...files.keys()].filter(key => !pattern?.baseUri || key.startsWith(pattern.baseUri.toString() + '/')).map(parse),
      createFileSystemWatcher: () => Object.assign(disposable(), { onDidCreate: events.create.event, onDidChange: events.change.event, onDidDelete: events.delete.event }),
      onDidChangeTextDocument: events.document.event,
      onDidOpenTextDocument: events.open.event,
      onDidCloseTextDocument: events.close.event,
      onDidChangeWorkspaceFolders: events.folders.event,
      fs: {
        stat: async uri => {
          const text = files.get(uri.toString());
          if (text !== undefined) { return { type: 1, size: Buffer.byteLength(text) }; }
          if ([...files.keys()].some(key => key.startsWith(uri.toString() + '/'))) { return { type: 2, size: 0 }; }
          throw missing();
        },
        readFile: async uri => {
          if (!files.has(uri.toString())) { throw missing(); }
          return Buffer.from(files.get(uri.toString()));
        }
      }
    },
    commands: { registerCommand: (name, callback) => { commands.set(name, callback); return disposable(); }, executeCommand: async () => {} }
  };
  const sandbox = { exports: {}, Buffer, TextDecoder,
    require: name => name === 'vscode' ? api : require('../out/activity'),
    Date: class extends Date { static now() { return now; } },
    setInterval: callback => { tick = callback; return 1; }, clearInterval: () => { timerCleared = true; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../out/extension.js'), 'utf8'), sandbox);
  const tracker = new sandbox.exports.ChangePulse();
  const uri = name => parse(`${root}/${name}`);
  return { tracker, files, events, api, view, commands, documents, editors, resources, uri,
    tick: time => { now = time; tick(); }, timerCleared: () => timerCleared,
    write(name, text, event = 'change') { files.set(uri(name).toString(), text); events[event].fire(uri(name)); },
    async clear() { await commands.get('file-change-flash.clearChanges')(); },
    document(name, text, dirty = true) {
      const doc = { uri: uri(name), text, isDirty: dirty, getText() { return this.text; },
        get lineCount() { return this.text.split('\n').length; }, lineAt: line => ({ range: { line } }) };
      documents.push(doc); events.open.fire(doc); return doc;
    }
  };
};
