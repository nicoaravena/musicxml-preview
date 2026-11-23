# Change Log

All notable changes to the "musicxml-preview" extension are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-23

First release under the `nicoaravena.musicxml-preview` identity, forked from
[Suzushiro-radish/musicxml-preview](https://github.com/Suzushiro-radish/musicxml-preview).

### Added

- Live preview beside the editor for `.musicxml` files and MusicXML `.xml` files
  (`score-partwise`), updated as you type.
- Read-only score viewer for compressed `.mxl` files, the default editor for `.mxl`. It re-renders
  when the file changes on disk.
- "Open Preview to the Side" button in the editor title bar, shown only for MusicXML scores.
- Error banner: a broken edit keeps the last good render on screen, and fixing the XML clears the
  banner.
- Messages for empty documents, `score-timewise` scores and unreadable files.
- Japanese translation of the UI. English is the default.

### Changed

- `.musicxml` files open as XML, with syntax highlighting.
- One preview per file: running the command again reveals the existing preview.
- The command is now `musicxmlPreview.showPreviewToSide` ("MusicXML: Open Preview to the Side").
- Requires VS Code 1.140 or later.

### Security

- OpenSheetMusicDisplay 3.0.0 is bundled. The extension makes no network requests.
- Document content is sent to the webview only through `postMessage`, under a nonce-based
  Content Security Policy, and never written into the HTML.
