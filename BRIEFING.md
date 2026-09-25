# Change Pulse

## Purpose

Make agent editing activity visible while the user watches Source Control, including repeated modifications to unopened files. Track all workspace text edits; attributing edits to a particular agent/process is outside scope.

## User intent and agreed workflow

Recorded from the user's clarification and accepted implementation direction on 2026-09-24. Treat this section as the product intent for future work.

> While an agent is working, I usually watch Source Control. I want to see which files it is modifying, see continued activity when it modifies a file repeatedly, and see how many lines have changed.

This is a paraphrase of the user's request. The primary experience is passive monitoring from Source Control: the user should be able to leave that sidebar open while the agent edits files, without opening each file, hovering to reveal counts, or manually refreshing. Editor highlights and Explorer badges provide supporting feedback.

The user accepted these counter semantics: show net lines added and removed since tracking started or the last explicit clear. Use the pulse to communicate ongoing activity. Repeated rewrites can therefore keep a file visibly active while its net count stays the same. Counts have their own baseline and remain independent of Git's last commit or staging state.

### Success criteria to preserve

1. An external edit to an eligible unopened workspace file appears in Source Control's Change Pulse view automatically.
2. Further text changes renew visible activity, even when net line counts do not increase. An earlier edit must not prematurely end the newer edit's pulse.
3. Each file's full added/removed counts are readable beside its name without a hover. The user can distinguish recent activity from the lasting net result.
4. Clearing starts a new observation period: the list and highlights clear, and subsequent counts compare against the latest observed text at reset.
5. The user can continue reviewing and staging through Git normally. Change Pulse does not stage, commit, or edit files.
6. Missing baselines, excluded files, and processing limits are represented honestly. An unavailable count must not be presented as zero or as an exact guessed count.

### Follow-up validation with the user

The implementation has automated functional coverage; the following real-workflow validation is still pending:

- Install the preview, leave Source Control open, and run an agent task that edits several files, including unopened ones and repeated rewrites of one file.
- Confirm that the separate Change Pulse view is visible enough alongside the Git changes list. The view placement is an implementation choice, not a requirement to preserve if a better supported presentation becomes available.
- Confirm that activity remains noticeable while counts stay stable, and that the 2.2-second activity window and 350 ms pulse cadence feel useful rather than distracting. These timings are current defaults, not user-specified requirements.
- Clear between agent tasks and verify that the new counts match the user's expectation of a fresh observation period.
- Record feedback in ROADMAP.md and add regression coverage for any changed behavior. Keep this intent section, README.md, and implementation semantics aligned.

Agent identity detection, activity attribution, and a complete event-by-event history have not been requested. The current product observes meaningful text changes from any source; it does not promise to display every intermediate filesystem write.

## Implemented behavior

- A Change Pulse tree view inside Source Control displays per-file net additions/removals without a hover.
- Filesystem watchers cover unopened files; document events cover unsaved edits.
- In-memory baselines start at activation and reset through Clear Activity and Reset Counters.
- Repeated text changes renew an activity deadline. Source Control icons and Explorer badges pulse; visible editors highlight changed lines/deletion anchors.
- Full URIs and `workspace.fs` support remote providers without local-path conversion.
- Bounded text retention, bounded diffs, duplicate-save handling, and resource disposal protect responsiveness.

## Architecture

- `src/activity.ts`: pure baseline model, bounded line diff, net counters, activity deadlines.
- `src/extension.ts`: workspace discovery, coalesced watcher reads, editor events, Source Control tree, file/editor decorations, commands and lifecycle.
- `tests/*.test.cjs`: model and mocked-host regression coverage.
- `tests/host-suite.cjs`: isolated VS Code 1.90.2 integration coverage, launched by `scripts/run-host-tests.cjs`.

## Decisions

Use a contributed tree view within Source Control because SCM resource rows do not offer arbitrary inline numeric descriptions. Do not modify Git's provider. Counts are net since start/clear, not cumulative activity and not Git HEAD deltas. Baselines are session-only. File types/size/budget restrictions and unavailable counts are documented in README.md.

## Before public release

Replace publisher/repository metadata, capture screenshots, visually check themes/accessibility and current VS Code, and exercise a real remote workspace. Timing/exclusion settings and a reduced-motion option remain future enhancements.
