# Change Pulse

See which files an agent is editing while you watch Source Control. Change Pulse also observes your own edits and other programs' writes; it does not identify which process made a change.

The intended workflow is to leave Source Control open while the agent works: watch files pulse as they are repeatedly modified and read the net line counts beside them. You should not need to open each file or hover to monitor progress. The pulse shows ongoing activity; the counters show the net result of the current observation period.

## Use it

1. Open a workspace and expand **Change Pulse** in the Source Control sidebar.
2. Wait for **Preparing file baselines…** to finish before starting the agent.
3. Files appear as they change, including files you have never opened. Each row shows `+N / −M` net line counts. The most recently changed file moves to the top.
4. A yellow activity icon pulses every 350 ms while a file is active. Further text changes extend activity until 2.2 seconds after the latest observed edit. Explorer gets a matching short badge; visible editors briefly highlight changed lines and deletion locations.
5. Use the view's **Clear Activity and Reset Counters** button before starting a fresh task.

The dedicated Change Pulse view sits alongside Git in Source Control. It does not change Git's staging UI, commit state, or counters. Explorer decorations can compete with other extensions' file decorations; the dedicated view is the reliable place to watch activity and full counts.

## What the counters mean

- Counts compare current text with an in-memory baseline taken when tracking starts or when you clear it. Replacing a line is one removal and one addition.
- Rewriting the same line repeatedly remains `+1 / −1`; it does not accumulate a count per keystroke. Reverting to the baseline shows `+0 / −0`, while still pulsing to acknowledge activity.
- New files compare against empty text. Deleted files remain listed as deleted until cleared. Renames appear as an old-path deletion and a new-path addition.
- Unsaved editor changes are included. Save notifications with identical content do not count twice or restart the pulse.
- CRLF/LF differences and the presence of a final newline do not add line counts. A text change can therefore pulse with zero line delta.
- Tracking is independent of Git and resets when the extension host reloads. No file contents or baselines are persisted or sent to a server.

## Scope and limits

Tracking uses VS Code's workspace filesystem and watcher APIs, preserving full URIs for remote workspaces. Untitled documents and files outside workspace folders are excluded. Actual delivery of external changes depends on the filesystem provider and VS Code watcher exclusions.

For responsiveness, tracking excludes `.git`, `node_modules`, `.venv`, `venv`, `.vscode-test`, `.next`, `dist`, `build`, `out`, and `coverage` directories. It accepts UTF-8 text up to 1 MiB per file, tracks up to 2,000 files, and caps retained baseline/current text at approximately 32 MiB. Excluded files remain excluded for the session; the view reports when exclusions or read errors occur.

Baseline scanning is not an atomic filesystem snapshot. Files changed before their baseline is available show **counts unavailable** rather than a guessed delta. Clearing establishes a baseline from their latest observed content. Very expensive diffs also show **counts unavailable** (25 ms / 4,000 edit-distance budget), but activity is still visible. Rapid intermediate writes may be coalesced into the latest observed text.

## Commands

- **Change Pulse: Clear Activity and Reset Counters** — drains queued file events, rebases retained files, and clears the list and highlights.
- **Change Pulse: Show Change Summary** — focuses the Change Pulse view.

## Development

Requires VS Code 1.90 or newer and Node.js/npm for development.

```sh
npm install
npm test
npm run lint
npm run test:host
npm run package
```

On Windows PowerShell with script execution disabled, use `npm.cmd`. Press F5 to run the extension in a development host. `test:host` downloads VS Code 1.90.2 into `.vscode-test` and launches an isolated profile/workspace to exercise real file watchers and editor events. The smaller test suite uses Node's test runner and a mocked VS Code API.

Before Marketplace publication, register or verify the `plusorminustwo-designs` publisher (display name: **plusorminustwo designs**), provide screenshots, and test the presentation on current VS Code and a real remote workspace. The packaged icon is `images/change-pulse-icon.png`.
