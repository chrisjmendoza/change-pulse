# File Change Flash

A lightweight VS Code extension that makes recent file edits stand out while you're actively working.

## Features

- Highlights the changed lines in the editor with a brief flash when a file is modified.
- Adds a lightweight badge on files in the Explorer to show the current +/− delta.
- Exposes a custom SCM group with a live `+N/-M` indicator for the most recently modified files.

## Run locally

1. Install dependencies:
   npm install
2. Launch the extension host from VS Code using the Run and Debug panel.
3. Open a workspace and edit a file to watch the highlight and counters update.

## Commands

- File Change Flash: Clear Recent File Change Highlights
- File Change Flash: Show Change Summary

## Notes

This extension is intentionally lightweight and uses the VS Code decoration APIs for the visual feedback.
