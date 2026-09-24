import * as vscode from 'vscode';

interface ChangeSummary {
  added: number;
  removed: number;
  changedLines: number[];
  updatedAt: number;
}

export function activate(context: vscode.ExtensionContext): void {
  const tracker = new FileChangeTracker();
  context.subscriptions.push(tracker);
}

export function deactivate(): void {
  // no-op
}

class FileChangeTracker implements vscode.Disposable {
  private readonly changes = new Map<string, ChangeSummary>();
  private readonly documentSnapshots = new Map<string, string>();
  private readonly flashDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findRangeHighlightBackground'),
    border: '1px solid rgba(250, 204, 21, 0.9)',
    borderRadius: '3px',
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    light: {
      backgroundColor: 'rgba(255, 240, 138, 0.65)'
    },
    dark: {
      backgroundColor: 'rgba(255, 186, 73, 0.24)'
    }
  });

  private readonly sourceControl = vscode.scm.createSourceControl('file-change-tracker', 'File Change Tracker');
  private readonly recentChangesGroup = this.sourceControl.createResourceGroup('recent-file-changes', 'Recent changes');
  private readonly fileDecorationProvider = new ActiveFileDecorationProvider(this.changes);
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.sourceControl.count = 0;
    this.recentChangesGroup.hideWhenEmpty = true;
    this.sourceControl.acceptInputCommand = {
      command: 'file-change-flash.clearChanges',
      title: 'Clear recent changes'
    };

    this.disposables.push(
      vscode.window.registerFileDecorationProvider(this.fileDecorationProvider),
      vscode.workspace.onDidOpenTextDocument((document) => this.trackSnapshot(document)),
      vscode.workspace.onDidChangeTextDocument((event) => this.handleDocumentChange(event.document)),
      vscode.commands.registerCommand('file-change-flash.clearChanges', () => this.clearAll()),
      vscode.commands.registerCommand('file-change-flash.showSummary', () => this.showSummary())
    );

    for (const document of vscode.workspace.textDocuments) {
      this.trackSnapshot(document);
    }

    this.refreshSourceControl();
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.flashDecoration.dispose();
  }

  private trackSnapshot(document: vscode.TextDocument): void {
    if (document.uri.scheme !== 'file') {
      return;
    }

    this.documentSnapshots.set(document.uri.fsPath, document.getText());
  }

  private handleDocumentChange(document: vscode.TextDocument): void {
    if (document.uri.scheme !== 'file') {
      return;
    }

    const path = document.uri.fsPath;
    const previousText = this.documentSnapshots.get(path) ?? document.getText();
    const diff = this.computeDiff(previousText, document.getText());

    this.documentSnapshots.set(path, document.getText());

    if (diff.changedLines.length === 0 && diff.added === 0 && diff.removed === 0) {
      return;
    }

    const existing = this.changes.get(path) ?? {
      added: 0,
      removed: 0,
      changedLines: [],
      updatedAt: 0
    };

    const next: ChangeSummary = {
      added: existing.added + diff.added,
      removed: existing.removed + diff.removed,
      changedLines: diff.changedLines,
      updatedAt: Date.now()
    };

    this.changes.set(path, next);
    this.refreshSourceControl();
    this.refreshEditorHighlight(document, diff.changedLines);
    this.fileDecorationProvider.refresh(vscode.Uri.file(path));

    setTimeout(() => {
      this.clearFlashForFile(path);
    }, 2200);
  }

  private refreshEditorHighlight(document: vscode.TextDocument, changedLines: number[]): void {
    const editorRanges = this.buildRangesForLines(document, changedLines);
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.fsPath === document.uri.fsPath) {
        editor.setDecorations(this.flashDecoration, editorRanges);
      }
    }
  }

  private clearFlashForFile(path: string): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.fsPath === path) {
        editor.setDecorations(this.flashDecoration, []);
      }
    }
  }

  private buildRangesForLines(document: vscode.TextDocument, changedLines: number[]): vscode.Range[] {
    const normalized = Array.from(new Set(changedLines)).sort((left, right) => left - right);
    if (normalized.length === 0) {
      return [];
    }

    const ranges: vscode.Range[] = [];
    let runStart = normalized[0];
    let runEnd = normalized[0];

    for (let index = 1; index < normalized.length; index += 1) {
      const current = normalized[index];
      if (current === runEnd + 1) {
        runEnd = current;
        continue;
      }

      ranges.push(this.rangeForLineRun(document, runStart, runEnd));
      runStart = current;
      runEnd = current;
    }

    ranges.push(this.rangeForLineRun(document, runStart, runEnd));
    return ranges;
  }

  private rangeForLineRun(document: vscode.TextDocument, start: number, end: number): vscode.Range {
    const safeStartLine = Math.max(0, start);
    const safeEndLine = Math.min(document.lineCount - 1, end);
    const startPosition = new vscode.Position(safeStartLine, 0);
    const endLineText = document.lineAt(safeEndLine).text;
    const endPosition = new vscode.Position(safeEndLine, endLineText.length);

    return new vscode.Range(startPosition, endPosition);
  }

  private computeDiff(previousText: string, nextText: string): { added: number; removed: number; changedLines: number[] } {
    const previousLines = previousText.split(/\r?\n/);
    const nextLines = nextText.split(/\r?\n/);

    let start = 0;
    while (
      start < previousLines.length &&
      start < nextLines.length &&
      previousLines[start] === nextLines[start]
    ) {
      start += 1;
    }

    let previousEnd = previousLines.length - 1;
    let nextEnd = nextLines.length - 1;
    while (
      previousEnd >= start &&
      nextEnd >= start &&
      previousLines[previousEnd] === nextLines[nextEnd]
    ) {
      previousEnd -= 1;
      nextEnd -= 1;
    }

    const removed = Math.max(0, previousEnd - start + 1);
    const added = Math.max(0, nextEnd - start + 1);

    if (removed === 0 && added === 0) {
      return { added: 0, removed: 0, changedLines: [] };
    }

    const changedLines: number[] = [];
    for (let index = start; index <= nextEnd; index += 1) {
      if (index >= 0 && index < nextLines.length) {
        changedLines.push(index);
      }
    }

    return {
      added,
      removed,
      changedLines
    };
  }

  private refreshSourceControl(): void {
    const resourceStates = Array.from(this.changes.entries())
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, 50)
      .map(([path, summary]) => ({
        resourceUri: vscode.Uri.file(path),
        command: {
          command: 'vscode.open',
          title: 'Open file',
          arguments: [vscode.Uri.file(path)]
        },
        contextValue: 'file-change-tracker-resource',
        decorations: {
          tooltip: `Recent changes: +${summary.added} / -${summary.removed} (${this.formatDelta(summary)})`
        }
      } as vscode.SourceControlResourceState));

    this.recentChangesGroup.resourceStates = resourceStates;
    this.sourceControl.count = resourceStates.length;
  }

  private formatDelta(summary: ChangeSummary): string {
    const added = summary.added > 0 ? `+${summary.added}` : '';
    const removed = summary.removed > 0 ? `-${summary.removed}` : '';

    if (added && removed) {
      return `${added}/${removed}`;
    }

    return added || removed || '•';
  }

  private clearAll(): void {
    this.changes.clear();
    this.refreshSourceControl();
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.flashDecoration, []);
    }
  }

  private showSummary(): void {
    const entries = Array.from(this.changes.entries())
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .map(([path, summary]) => `${path}: +${summary.added} / -${summary.removed}`)
      .join('\n');

    if (!entries) {
      vscode.window.showInformationMessage('No recent file changes are currently tracked.');
      return;
    }

    vscode.window.showInformationMessage(entries, { modal: false });
  }
}

class ActiveFileDecorationProvider implements vscode.FileDecorationProvider {
  private readonly changes: Map<string, ChangeSummary>;
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | undefined>();

  public readonly onDidChangeFileDecorations = this.emitter.event;

  constructor(changes: Map<string, ChangeSummary>) {
    this.changes = changes;
  }

  public refresh(uri?: vscode.Uri): void {
    this.emitter.fire(uri);
  }

  public provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const summary = this.changes.get(uri.fsPath);
    if (!summary) {
      return undefined;
    }

    const badge = this.formatBadge(summary);
    return {
      badge,
      color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
      tooltip: `Recent file changes: +${summary.added} / -${summary.removed}`
    };
  }

  private formatBadge(summary: ChangeSummary): string {
    const added = summary.added > 0 ? `+${summary.added}` : '';
    const removed = summary.removed > 0 ? `-${summary.removed}` : '';

    if (added && removed) {
      return `${added}/${removed}`.slice(0, 4);
    }

    return (added || removed || '•').slice(0, 4);
  }
}
