# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- Set publisher ID to plusorminustwo-designs and link the public Change Pulse repository.
- Resolve the extension-host test identity from the manifest so publisher changes stay covered.

### Documentation
- Recorded the user's Source Control monitoring workflow, agreed counter semantics, success criteria, and pending real-agent validation in BRIEFING.md and ROADMAP.md.

### Added
- Workspace file watchers for agent edits to unopened files, plus unsaved editor tracking.
- Change Pulse view inside Source Control with inline net line counts and pulsing activity icons.
- Fixed session baselines with an explicit clear/reset action, independent of Git.
- Short transient Explorer badges and editor highlights with deletion anchors.
- Model, mocked-host, and real extension-host tests; bounded file/diff processing.
- Generated Marketplace icon and packaging exclusions.

### Fixed
- Repeated edits no longer inflate net counters or let old timers clear new activity.
- Disjoint changes no longer count untouched intervening lines.
- Clear invalidates file decorations; all registered resources and timers are disposed.
- Remote URIs retain their scheme and authority; minimum VS Code API types are pinned to 1.90.0.

## [0.1.0] - 2026-09-24

### Added
- Initial extension release scaffold.
