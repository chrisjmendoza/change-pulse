import * as vscode from 'vscode';
import { Activity, ActivityModel } from './activity';

const EXCLUDE = '**/{.git,node_modules,.venv,venv,.vscode-test,.next,dist,build,out,coverage}/**';
const IGNORED = /(?:^|\/)(?:\.git|node_modules|\.venv|venv|\.vscode-test|\.next|dist|build|out|coverage)(?:\/|$)/;
const MAX_FILE_BYTES = 1024 * 1024;

/** Track session activity, including files never opened in an editor. */
export function activate(context: vscode.ExtensionContext): ChangePulse {
  const tracker = new ChangePulse();
  context.subscriptions.push(tracker);
  return tracker;
}

/** Activity view alongside Git in Source Control, plus transient file decorations. */
export class ChangePulse implements vscode.Disposable, vscode.TreeDataProvider<Activity>, vscode.FileDecorationProvider {
  readonly model = new ActivityModel();
  private readonly treeEvents = new vscode.EventEmitter<Activity | undefined>();
  private readonly decorationEvents = new vscode.EventEmitter<vscode.Uri | undefined>();
  readonly onDidChangeTreeData = this.treeEvents.event;
  readonly onDidChangeFileDecorations = this.decorationEvents.event;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pending = new Map<string, boolean>();
  private readonly excluded = new Set<string>();
  private readonly token = new vscode.CancellationTokenSource();
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('editor.findRangeHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.modifiedForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });
  private readonly view: vscode.TreeView<Activity>;
  private timer: ReturnType<typeof setInterval>;
  private stopped = false;
  private initializing = true;
  private draining = false;
  private phase = false;
  private previouslyActive = false;
  private limited = false;
  private readErrors = false;
  private inFlight: Promise<void> | undefined;
  /** Resolves when initial baselines and queued startup changes have been processed. */
  readonly ready: Promise<void>;

  constructor() {
    this.view = vscode.window.createTreeView('changePulse.activity', { treeDataProvider: this, showCollapseAll: false });
    this.view.message = 'Preparing file baselines…';
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    this.disposables.push(this.view, watcher, this.treeEvents, this.decorationEvents, this.decoration, this.token,
      vscode.window.registerFileDecorationProvider(this),
      watcher.onDidCreate(uri => this.queue(uri, true)),
      watcher.onDidChange(uri => this.queue(uri)),
      watcher.onDidDelete(uri => this.queue(uri)),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.contentChanges.length) { this.documentChanged(event.document); }
      }),
      vscode.workspace.onDidOpenTextDocument(document => this.documentOpened(document)),
      vscode.workspace.onDidCloseTextDocument(document => this.queue(document.uri)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => { void this.reconcileFolders(); }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.renderEditors()),
      vscode.commands.registerCommand('file-change-flash.clearChanges', async () => {
        await this.ready; await this.flush();
        if (this.stopped) { return; }
        this.model.clear(); this.refresh();
      }),
      vscode.commands.registerCommand('file-change-flash.showSummary', () => vscode.commands.executeCommand('changePulse.activity.focus'))
    );
    this.timer = setInterval(() => {
      if (this.initializing || this.stopped) { return; }
      void this.flush();
      const active = [...this.model.entries.values()].some(entry => entry.activeUntil > Date.now());
      if (active || this.previouslyActive) { this.phase = !this.phase; this.refresh(); }
      this.previouslyActive = active;
    }, 350);
    this.ready = this.initialize();
  }

  private eligible(uri: vscode.Uri): boolean {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return !!folder && !IGNORED.test(uri.path.slice(folder.uri.path.length)) && !this.excluded.has(uri.toString());
  }

  private queue(uri: vscode.Uri, created = false): void {
    if (this.stopped || !this.eligible(uri)) { return; }
    const key = uri.toString();
    this.pending.set(key, created || this.pending.get(key) || false);
    // Folder delete/rename notifications need not include individual child events.
    for (const tracked of this.model.entries.keys()) {
      if (tracked.startsWith(key.replace(/\/$/, '') + '/')) { this.pending.set(tracked, false); }
    }
  }

  private async initialize(): Promise<void> {
    try { await this.seedWorkspace(); } catch { this.readErrors = true; }
    if (this.stopped) { return; }
    this.initializing = false;
    await this.flush(); this.refresh();
  }

  private async seedWorkspace(): Promise<void> {
    for (const document of vscode.workspace.textDocuments) { this.documentOpened(document); }
    const uris = await vscode.workspace.findFiles('**/*', EXCLUDE, this.model.maxFiles + 1, this.token.token);
    if (uris.length > this.model.maxFiles) { this.limited = true; }
    let index = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (index < Math.min(uris.length, this.model.maxFiles) && !this.stopped) {
        const uri = uris[index++]; const key = uri.toString();
        if (!this.eligible(uri) || this.model.entries.has(key) || this.pending.has(key)) { continue; }
        const text = await this.readText(uri);
        if (this.stopped || !this.eligible(uri) || this.pending.has(key)) { continue; }
        if (text !== undefined) { this.accept(key, this.model.seed(key, text)); }
      }
    }));
    for (const document of vscode.workspace.textDocuments) { this.documentOpened(document); }
  }

  private documentOpened(document: vscode.TextDocument): void {
    if (this.stopped || !this.eligible(document.uri) || this.model.entries.has(document.uri.toString())) { return; }
    const text = document.getText();
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) { this.skip(document.uri.toString()); return; }
    if (this.pending.has(document.uri.toString())) { return; }
    this.accept(document.uri.toString(), this.model.seed(document.uri.toString(), text));
  }

  private documentChanged(document: vscode.TextDocument): void {
    if (this.stopped || !this.eligible(document.uri)) { return; }
    if (this.initializing) { this.queue(document.uri); return; }
    const key = document.uri.toString(); const text = document.getText();
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) { this.skip(key); this.refresh(); return; }
    this.accept(key, this.model.update(key, text, true, this.pending.get(key) ?? false, Date.now()));
    this.refresh();
  }

  private async readText(uri: vscode.Uri): Promise<string | undefined> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type & vscode.FileType.Directory) { return undefined; }
      if (stat.size > MAX_FILE_BYTES) { this.skip(uri.toString()); return undefined; }
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.length > MAX_FILE_BYTES || bytes.includes(0)) { this.skip(uri.toString()); return undefined; }
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { this.skip(uri.toString()); return undefined; }
    } catch (error) {
      if ((error as { code?: string }).code !== 'FileNotFound') { this.readErrors = true; }
      return undefined;
    }
  }

  /** Coalesce duplicate save events and serialize batches with bounded parallel I/O. */
  async flush(): Promise<void> {
    if (this.draining) { await this.inFlight; if (this.pending.size) { await this.flush(); } return; }
    if (this.initializing || this.stopped || !this.pending.size) { return; }
    this.draining = true;
    this.inFlight = (async () => {
      const batch = [...this.pending]; this.pending.clear();
      let index = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (index < batch.length && !this.stopped) {
          const [key, created] = batch[index++]; const uri = vscode.Uri.parse(key);
          if (created) {
            try {
              const stat = await vscode.workspace.fs.stat(uri);
              if (stat.type & vscode.FileType.Directory) {
                const children = await vscode.workspace.findFiles(new vscode.RelativePattern(uri, '**/*'), EXCLUDE, this.model.maxFiles + 1, this.token.token);
                if (children.length > this.model.maxFiles) { this.limited = true; }
                for (const child of children.slice(0, this.model.maxFiles)) { this.queue(child, true); }
                continue;
              }
            } catch { /* The file may have been deleted again; resolve below. */ }
          }
          const previous = this.model.entries.get(key);
          const diskText = await this.readText(uri);
          if (this.stopped || !this.eligible(uri)) { continue; }
          if (this.model.entries.get(key) !== previous) { this.queue(uri, created); continue; }
          const dirty = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === key && doc.isDirty);
          let text = dirty?.getText() ?? diskText;
          let exists = true;
          if (text === undefined) {
            try { await vscode.workspace.fs.stat(uri); continue; }
            catch (error) {
              if ((error as { code?: string }).code !== 'FileNotFound') { this.readErrors = true; continue; }
              exists = false; text = '';
            }
          }
          if (this.stopped || this.model.entries.get(key) !== previous) { continue; }
          if (!previous && !exists) { continue; }
          this.accept(key, this.model.update(key, text, exists, created, Date.now()));
        }
      }));
    })();
    try { await this.inFlight; } catch { this.readErrors = true; }
    finally { this.draining = false; this.inFlight = undefined; if (!this.stopped) { this.refresh(); } }
    if (this.pending.size && !this.stopped) { await this.flush(); }
  }

  private accept(key: string, accepted: boolean): void { if (!accepted) { this.skip(key); } }
  private skip(key: string): void {
    this.limited = true; this.model.remove(key); this.excluded.add(key);
  }

  private async reconcileFolders(): Promise<void> {
    for (const key of this.model.entries.keys()) {
      if (!this.eligible(vscode.Uri.parse(key))) { this.model.remove(key); }
    }
    try { await this.seedWorkspace(); } catch { this.readErrors = true; }
    if (!this.stopped) { this.refresh(); }
  }

  getChildren(): Activity[] {
    return [...this.model.entries.values()].filter(entry => entry.touched).sort((a, b) => b.sequence - a.sequence);
  }

  getTreeItem(entry: Activity): vscode.TreeItem {
    const uri = vscode.Uri.parse(entry.key);
    const item = new vscode.TreeItem(uri.path.split('/').pop() || uri.path);
    item.id = entry.key;
    const active = entry.activeUntil > Date.now();
    item.description = `${entry.delta ? `+${entry.delta.added} / −${entry.delta.removed}` : 'counts unavailable'}${active ? ' · active' : ''}${entry.exists ? '' : ' · deleted'} · ${vscode.workspace.asRelativePath(uri)}`;
    item.tooltip = `${vscode.workspace.asRelativePath(uri)}\nNet line changes since tracking started or was cleared.${entry.baseline === undefined ? '\nNo pre-edit baseline was available; clear tracking to establish one.' : !entry.delta ? '\nDiff exceeded the computation budget.' : ''}`;
    item.iconPath = new vscode.ThemeIcon(active ? (this.phase ? 'circle-filled' : 'circle-outline') : 'file',
      active ? new vscode.ThemeColor('charts.yellow') : undefined);
    if (entry.exists) { item.command = { command: 'vscode.open', title: 'Open file', arguments: [uri] }; }
    return item;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const entry = this.model.entries.get(uri.toString());
    if (!entry?.touched || entry.activeUntil <= Date.now()) { return undefined; }
    return { badge: this.phase ? '●' : '○', color: new vscode.ThemeColor('charts.yellow'),
      tooltip: `Change Pulse: active${entry.delta ? ` (+${entry.delta.added} / -${entry.delta.removed})` : ''}` };
  }

  private refresh(): void {
    if (this.stopped) { return; }
    this.view.message = this.initializing ? 'Preparing file baselines…' :
      `${this.getChildren().length} files changed · net counts since start/clear${this.limited ? ' · some files excluded by size, encoding or tracking limits' : ''}${this.readErrors ? ' · some files could not be read' : ''}`;
    this.treeEvents.fire(undefined); this.decorationEvents.fire(undefined); this.renderEditors();
  }

  private renderEditors(): void {
    if (this.stopped) { return; }
    for (const editor of vscode.window.visibleTextEditors) {
      const entry = this.model.entries.get(editor.document.uri.toString());
      const ranges = entry && entry.activeUntil > Date.now() ? entry.changedLines.map(line => {
        const safe = Math.max(0, Math.min(line, editor.document.lineCount - 1));
        return editor.document.lineAt(safe).range;
      }) : [];
      editor.setDecorations(this.decoration, ranges);
    }
  }

  dispose(): void {
    this.stopped = true; clearInterval(this.timer); this.token.cancel();
    this.pending.clear(); this.model.entries.clear(); this.excluded.clear();
    for (const disposable of this.disposables) { disposable.dispose(); }
  }
}
