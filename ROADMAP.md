# Roadmap

## Product direction

Follow the [user intent and success criteria in BRIEFING.md](BRIEFING.md#user-intent-and-agreed-workflow): make repeated agent edits visible from Source Control, with inline net line counts since start/clear. Preserve that workflow when changing the UI, tracking logic, or counter semantics.

## Next: validate the intended workflow

- [ ] Try the preview during a real agent task while keeping Source Control open.
- [ ] Confirm unopened-file activity and repeated rewrites are easy to notice without opening files or hovering.
- [ ] Confirm the dedicated Change Pulse view works well alongside Git's changes list; record any placement/visibility problems.
- [ ] Confirm stable net counts during repeated rewrites and reset behavior between tasks match expectations.
- [ ] Gather feedback on pulse cadence/duration and accessibility before choosing configurable defaults.

Automated functional checks are complete; these user-experience checks remain pending. Record observed results here rather than treating implementation completion as user validation.

## Phase 1: Foundation
- [x] Create base VS Code extension project.
- [x] Add editor flash behavior for changes.
- [x] Add file badge and SCM tracking.
- [x] Add local packaging scripts and standard docs.

## Phase 2: UX polish
- [x] Track unopened workspace files and repeated agent editing activity.
- [x] Display net counters in a dedicated Source Control view.
- [x] Add bounded tracking, regression tests, and real extension-host checks.
- [ ] Improve flash timing and intensity controls.
- [ ] Add configuration settings for highlight duration based on workflow feedback.
- [x] Improve Explorer and Source Control grouping logic.
- [ ] Add reduced-motion preferences and configurable exclusions.

## Phase 3: Shareability
- [x] Publish to a public GitHub repository.
- [ ] Package for Marketplace publishing.
- [ ] Add screenshots and demo GIF.
- [ ] Publish to VS Code Marketplace if desired.
