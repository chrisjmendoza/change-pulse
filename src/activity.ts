import { diffArrays } from 'diff';

/** Normalize line endings without treating a terminal newline as an extra line. */
export function lines(text: string): string[] {
  if (!text) { return []; }
  const result = text.replace(/\r\n/g, '\n').split('\n');
  if (result[result.length - 1] === '') { result.pop(); }
  return result;
}

/** Exact net counts; undefined means the bounded diff could not finish. */
export function lineDelta(before: string, after: string): { added: number; removed: number; changedLines: number[] } | undefined {
  const nextLines = lines(after);
  const parts = diffArrays(lines(before), nextLines, { timeout: 25, maxEditLength: 4000 });
  if (!parts) { return undefined; }
  let added = 0; let removed = 0; let position = 0;
  const changedLines = new Set<number>();
  const lastLine = Math.max(0, nextLines.length - 1);
  for (const part of parts) {
    if (part.removed) {
      removed += part.count;
      changedLines.add(Math.min(position, lastLine));
    } else {
      if (part.added) {
        added += part.count;
        for (let i = 0; i < part.count; i++) { changedLines.add(position + i); }
      }
      position += part.count;
    }
  }
  return { added, removed, changedLines: [...changedLines] };
}

export interface Activity {
  key: string;
  baseline: string | undefined;
  current: string;
  exists: boolean;
  touched: boolean;
  updatedAt: number;
  activeUntil: number;
  sequence: number;
  delta: ReturnType<typeof lineDelta>;
  changedLines: number[];
}

/** Session baselines and net counters, independent of Git and VS Code UI. */
export class ActivityModel {
  readonly entries = new Map<string, Activity>();
  private bytes = 0;
  private sequence = 0;
  constructor(readonly duration = 2200, readonly maxFiles = 2000, readonly maxBytes = 32 * 1024 * 1024) {}

  seed(key: string, text: string): boolean {
    if (this.entries.has(key)) { return true; }
    return this.store({ key, baseline: text, current: text, exists: true, touched: false,
      updatedAt: 0, activeUntil: 0, sequence: 0, delta: { added: 0, removed: 0, changedLines: [] }, changedLines: [] });
  }

  update(key: string, text: string, exists: boolean, created: boolean, now: number): boolean {
    const previous = this.entries.get(key);
    if (previous && previous.current === text && previous.exists === exists) { return true; }
    const baseline = previous ? previous.baseline : created ? '' : undefined;
    const delta = baseline === undefined ? undefined : lineDelta(baseline, text);
    const recent = lineDelta(previous?.current ?? '', text);
    return this.store({ key, baseline, current: text, exists, touched: true,
      updatedAt: now, activeUntil: now + this.duration, sequence: ++this.sequence,
      delta, changedLines: recent?.changedLines ?? [0] });
  }

  clear(): void {
    for (const [key, entry] of this.entries) {
      if (!entry.exists) { this.entries.delete(key); continue; }
      this.entries.set(key, { ...entry, baseline: entry.current, touched: false, activeUntil: 0,
        delta: { added: 0, removed: 0, changedLines: [] }, changedLines: [] });
    }
    this.bytes = [...this.entries.values()].reduce((sum, entry) => sum + this.size(entry), 0);
  }

  remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) { this.bytes -= this.size(entry); this.entries.delete(key); }
  }

  private size(entry: Activity): number { return 2 * ((entry.baseline?.length ?? 0) + entry.current.length); }
  private store(entry: Activity): boolean {
    const previous = this.entries.get(entry.key);
    const nextBytes = this.bytes - (previous ? this.size(previous) : 0) + this.size(entry);
    if ((!previous && this.entries.size >= this.maxFiles) || nextBytes > this.maxBytes) { return false; }
    this.entries.set(entry.key, entry); this.bytes = nextBytes; return true;
  }
}
