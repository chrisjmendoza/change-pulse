# Change Pulse review — 2026-09-24

## Implementation follow-up

The findings below describe the original scaffold and are retained as historical review evidence. The agent-activity implementation replaces its SCM provider with a tree view in Source Control, adds unopened-file watchers, uses fixed baselines and bounded real line diffs, and fixes badge length, pulse renewal, clearing, deletion anchors, URI handling, and disposal. Automated regression tests replace the old defect-reproduction script. README.md describes the implemented semantics and limits.

Marketplace publisher registration, screenshots, actual remote-provider validation, and visual/accessibility checks remain release work. The package now uses plusorminustwo-designs and the public chrisjmendoza/change-pulse repository. See BRIEFING.md for the current architecture.

### Follow-up verification

- `npm.cmd test`: 17 passing model and mocked-host regression tests.
- `npm.cmd run lint`: passed against pinned VS Code 1.90.0 API declarations.
- `npm.cmd run test:host`: passed in an isolated real VS Code 1.90.2 host, covering unopened-file writes, inline count descriptions, repeated writes, clear/rebase, pulse expiry, dirty editor/save deduplication, creation/deletion, and Source Control view commands. This is functional integration coverage, not a visual design review.
- VSIX packaging: passed with runtime diff dependency included and source/test/development material excluded.
- Dependency installation audit after selecting patched `diff@8.0.4`: zero reported vulnerabilities.
- `git diff --check`: passed. Checks rerun on 2026-09-25 for integration; the real-host test now derives the extension identity from the manifest.

## Original review

The scaffold compiles and packages, but is not ready for Marketplace release. This review leaves runtime code unchanged. The artwork update is separate from the findings below.

## Findings

1. **High: ordinary edits produce invalid Explorer badges** (`src/extension.ts:299-307`). Replacing text on one line yields `+1/-`, four characters; VS Code's validator accepts at most two ordinary characters. Single-sided totals also exceed the limit at 10. Use a stable short badge such as `M` and keep full totals in the tooltip. Verified against [VS Code's FileDecoration validator](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/extHostTypes.ts) and reproduced with the harness.

2. **Medium: an older timer clears a newer flash** (`src/extension.ts:113-115`). Edit at t=0 and again at t=2 seconds: the first timeout clears the new highlight after only 0.2 seconds. Keep one cancellable timeout per URI, reset on each edit, and cancel on clear/dispose.

3. **Medium: clearing changes does not invalidate Explorer decorations** (`src/extension.ts:248-254`). The map is cleared but the provider never fires its change event. Previously cached badges can remain until another refresh. Call `fileDecorationProvider.refresh()` after clearing.

4. **Medium: disjoint edits count and highlight untouched lines** (`src/extension.ts:171-212`). Replacing `a\nunchanged\nz` with `A\nunchanged\nZ` reports +3/-3 and highlights all three lines. Multi-cursor edits and formatters can greatly inflate these results. Use event change ranges for per-edit activity, or a proper line diff for net totals.

5. **Medium: whole-line deletions do not flash** (`src/extension.ts:202-207`). Deleting `b` from `a\nb\nc` produces no changed-line ranges, so there is no visible pulse. Anchor a deletion marker on a surviving adjacent line, with an explicit empty-document case.

6. **Medium: resource and document lifecycle cleanup is incomplete** (`src/extension.ts:49-69, 71-76`). Dispose does not release the SCM provider, resource group, emitter, or pending timers. Document snapshots are never removed on close, retaining full text of every opened file for the session. Add explicit disposal and a close listener. Rename/delete events also need to remove or migrate tracked entries, otherwise SCM can list obsolete paths.

7. **Medium: remote files are silently ignored** (`src/extension.ts:72, 80`). Both snapshot and change handling require the `file` scheme; `vscode-remote` documents are excluded. If Remote SSH/WSL/Containers are intended, preserve complete URIs and key by `uri.toString()` instead of converting all resources through `Uri.file(fsPath)`. Otherwise document the local-file limitation.

## Product and release gaps

- Totals are cumulative activity, not current file/Git deltas: typing ten characters can report +10/-10, and undo adds more activity. Decide which meaning is intended and document it. Nothing expires the recorded activity; only the editor flash is temporary.
- SCM counters are in hover tooltips, not a dedicated live +N/-M row label as the README implies. Its list is capped at 50 while internal tracking is unbounded.
- The README still calls the extension File Change Flash; command categories use Change Pulse and SCM uses File Change Tracker. Align user-facing names.
- `publisher`, repository, homepage, and issue URLs are placeholders in `package.json`. Supply the real publisher/repository before release.
- No `.vscodeignore` or package `files` list: packaging includes source maps, development configuration, issue templates, briefing, and review material. Establish a runtime/artwork/docs allowlist before publishing.
- `@types/vscode` resolves to 1.138.0 while the manifest permits 1.90.0. No specific unsupported call was found, but compiling against newer types does not validate the minimum version. Pin matching API types and test the minimum host.
- No automated extension-host tests exist. The probe below is a diagnostic reproduction, not a correctness suite or visual integration test.
- Every text change scans/splits the entire document and rebuilds/sorts SCM state synchronously. Large-file responsiveness needs measurement; consider event ranges and batched SCM refreshes.

## Verification

- `npm.cmd run lint`: passed (TypeScript check, not a separate style linter).
- `npm.cmd run compile`: passed.
- `node scripts/review-probes.cjs`: reproduced invalid badge output, timer overlap, missing clear invalidation, disjoint-edit overcounting, invisible deletion, and incomplete SCM disposal.
- `npx.cmd --no-install vsce package --out <temporary-path>`: passed with missing packaging-filter warning.
- Reviewed all runtime source, manifest, launch/tasks configuration, briefing, roadmap, and public documentation.
- No real VS Code extension-host UI session, remote-workspace integration test, or Marketplace publication was performed. No guarantee of zero remaining issues is implied.

The icon must be PNG and at least 128×128; 256×256 is recommended for Retina screens in the [extension manifest reference](https://code.visualstudio.com/api/references/extension-manifest).
