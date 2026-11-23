# MusicXML Preview - Spec for first Marketplace release

## Context

The extension is a fork of `Suzushiro-radish/musicxml-preview` that will be published under a
new, independent Marketplace identity. Today it cannot preview anything in a default VS Code: the command
requires `languageId === "xml"` **and** a `.musicxml` filename (`src/extension.ts:13`), but VS Code
(1.147, checked) does not map `.musicxml` to XML, so it is `plaintext` and rejected (files starting
with `<?xml` do become `xml` via the built-in `firstLine` rule, but `.xml` scores and `.mxl` are still
rejected by the filename check). It also
loads OSMD from a CDN (no offline), interpolates file content into a `<script>` block (injection
via `</script>`), may wedge after a render error, re-renders on every keystroke, opens a new panel
per invocation, ignores `.xml`/`.mxl`, and has only the template placeholder test.

Approach chosen by the user: **option 2 - "command + score viewer"** (side-by-side live preview
for text MusicXML, read-only rendered viewer for compressed `.mxl`, one shared renderer).

### Approaches considered

1. **Command only** - smallest change, but `.mxl` has no text editor to launch from, so it stays
   half-supported.
2. **Command + score viewer** (chosen) - live side preview for text formats, custom read-only
   viewer for `.mxl`; mirrors VS Code's Markdown preview and image viewer.
3. **Score viewer for every format** - `.musicxml`/`.xml` open rendered by default; editing the XML
   needs "Reopen With..." and loses the live side-by-side loop.

## Intent

Anyone who installs the extension from the Marketplace can open a MusicXML file - text or
compressed - and see the rendered score, offline, with zero configuration, and edit text MusicXML
with the score updating beside it.

## Goals

1. `.musicxml`, MusicXML-in-`.xml`, and `.mxl` all render.
2. Works offline; no network requests at runtime.
3. File content can never execute as script in the webview.
4. A bad edit shows an error but never breaks the preview; fixing the XML recovers it.
5. Feels native: editor-title preview button, one preview per file, `.mxl` opens like an image.
6. Publishable: own identity, English UI (Japanese translation kept), passes `vsce package`.

## Non-goals (v1)

Playback/audio, MIDI/PDF/PNG export, graphical score editing, zoom controls, transposition,
restoring previews after window reload (`WebviewPanelSerializer`), web extension (vscode.dev)
support, `score-timewise` rendering (OSMD does not support it), Open VSX publishing, automated
publishing from CI. All are candidate follow-ups.

## Anti-goals

- Any runtime network fetch (CDN, telemetry).
- Interpolating document content into webview HTML.
- Hijacking `.xml` files that are not scores (no preview button, no default editor change).
- Making `.musicxml`/`.xml` open as a rendered score by default (text stays the default editor).

## Glossary

- **Score file** - a file classified as MusicXML: format `text` (`.musicxml`, `.xml`) or `mxl`.
- **Preview panel** - webview beside a text editor, live-updating from the unsaved document.
- **Score viewer** - read-only custom editor rendering a score file from disk (default for `.mxl`).
- **Renderer** - the webview-side script that runs OSMD and reports `rendered` / `error`.

## Behaviour

### Score file detection (domain, pure)

`classifyScoreFile(fileName, head)` -> `{ kind: "text" | "mxl" | "not-score", root?: "score-partwise" | "score-timewise" }`

- `.mxl` -> `mxl`.
- `.musicxml` -> `text`.
- `.xml` -> `text` only if the first root element (after XML declaration, comments, DOCTYPE,
  BOM, whitespace) is `score-partwise` or `score-timewise`; otherwise `not-score`.
  Inspect only the head of the document (builder picks the size, ~64 KB).
- Anything else -> `not-score`.
- Case-insensitive extensions.

### Language registration

Contribute `.musicxml` to the existing `xml` language
(`contributes.languages: [{ id: "xml", extensions: [".musicxml"] }]`) so it gets XML highlighting.
Detection does **not** depend on `languageId`.

### Entry points

- Command `musicxmlPreview.showPreviewToSide` - "MusicXML: Open Preview to the Side". Uses the
  active editor; if it is not a text score file, show "The active file is not a MusicXML score."
- Editor title button (`$(open-preview)`) and Command Palette entry, shown only when the active
  editor is a text score file. `.musicxml` via `resourceExtname`; `.xml` via a context key
  (`musicxmlPreview.isScore`) the extension sets on active-editor change.
- Custom editor `musicxmlPreview.scoreViewer` (read-only): priority `default` for `*.mxl`,
  `option` for `*.musicxml` and `*.xml` (available via "Reopen Editor With...").

### Preview panel

- One panel per source document; invoking again reveals it.
- Title "Preview <filename>"; opens in `ViewColumn.Beside`, preserving editor focus.
- Updates on document change, debounced (~300 ms; clock injected for tests).
- When the source document closes, the panel stays with its last render and stops updating
  (builder may instead close it - mark choice in code).

### Score viewer

- Reads bytes with `vscode.workspace.fs.readFile` (works in remote/WSL).
- Re-renders when the file changes on disk (`FileSystemWatcher`), e.g. MuseScore re-export.
- `.mxl` bytes are sent to the renderer; OSMD 3 accepts a binary string starting with `PK` (or a
  `Blob`) and unzips it itself (verified in the 3.0.0 bundle).

### Renderer and messaging

- Content is sent **only** via `postMessage`, never in the HTML.
- Typed protocol in one shared module:
  host -> webview `{ type: "render", format: "text" | "mxl", data: string | Uint8Array, version }`;
  webview -> host `{ type: "ready" }`, `{ type: "rendered", version }`, `{ type: "error", version, message }`.
  The host waits for `ready` before the first `render`; stale versions are ignored.
- Error handling: keep the last good render on screen and show an error banner above it with the
  message; next successful render clears it. Never replace OSMD's container contents.
- Empty document -> "This document is empty." `score-timewise` -> "score-timewise is not
  supported; convert to score-partwise." (both detected host-side, no OSMD call).
- Score drawn on a white "paper" background regardless of theme; banner uses theme colours.

### Security (webview)

- CSP: `default-src 'none'; script-src 'nonce-<random>'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data: blob:; font-src ${cspSource};`
  (builder confirms OSMD/VexFlow needs; loosen only what is proven necessary).
- `localResourceRoots` limited to `out/`. `enableScripts: true`, no command URIs.

### Localisation

English is the default. Runtime strings via `vscode.l10n.t`, Japanese in
`l10n/bundle.l10n.ja.json`; contribution strings in `package.nls.json` / `package.nls.ja.json`.

### Identity and packaging

- `name` `musicxml-preview`, `displayName` "MusicXML Preview" (fallback "MusicXML Score Preview"
  if the Marketplace rejects the name as taken).
- `publisher`: **not created yet**. Slices 1-4 use a placeholder held in one `package.json` field
  (tests read the extension ID from `package.json`, never hard-code it). Slice 5 includes a
  checklist for creating the publisher (Azure DevOps org, PAT, `vsce login`) and swapping in the ID.
- `repository`: `https://github.com/nicoaravena/musicxml-preview` (from `git remote`).
- `categories` `["Visualization"]`, keywords, 128x128 PNG icon.
- `LICENSE`: keep "Copyright (c) 2025 suzushiro-radish" and add the user's line.
- Minimum VS Code **1.140**: `engines.vscode` `^1.140.0`, `@types/vscode` `~1.140.0` (`vsce` rejects
  types newer than engines; today `^1.146` types vs `^1.143` engines would fail). CI tests against
  1.140.0 and `stable`.
- Publishing is **manual**: CI builds and uploads the `.vsix` as an artifact; no publish tokens in CI.
- OSMD as pinned runtime dependency `opensheetmusicdisplay@3.0.0`, bundled into `out/webview.js`
  by a second esbuild entry (`platform: "browser"`, `format: "iife"`). `@vscode/vsce` as
  devDependency, script `package:vsix` (`vsce package --no-dependencies`, everything is bundled).
- pnpm is the package manager: drop `package-lock.json`. `.gitignore` gains `out/`,
  `.vscode-test/`, `*.vsix`. `.vscodeignore` excludes `index.html`, `docs/`, fixtures, lockfiles.
- README rewritten (features, screenshot, commands, supported formats, privacy: no network),
  CHANGELOG 0.1.0.

## Architecture (fits current esbuild/TS layout)

```
src/
  extension.ts                 composition root: register commands, providers, context keys
  domain/scoreFile.ts          classifyScoreFile, ScoreFormat  (pure, unit-tested)
  domain/renderRequest.ts      decide render vs empty/timewise message (pure)
  shared/messages.ts           typed host<->webview protocol
  preview/previewManager.ts    panel-per-document, debounce, lifecycle (clock injected)
  preview/scoreViewer.ts       CustomReadonlyEditorProvider + file watcher
  preview/webviewHtml.ts       HTML + CSP + nonce builder (pure)
  webview/main.ts              renderer: OSMD, banner, protocol (browser bundle)
  test/fixtures/               hello.musicxml, hello.xml, no-declaration.musicxml, not-a-score.xml, hello.mxl, timewise.musicxml, broken.musicxml
  test/unit/*.test.ts          domain + html builder
  test/integration/*.test.ts   extension host: command, context key, custom editor, rendered/error acks
```

## Delivery slices (each end to end, tests + reachable entry point)

1. **Detection fix** - domain classifier, language registration, command accepts
   `.musicxml`/`.xml`, English messages. Unblocks preview.
2. **Safe offline renderer** - bundled OSMD, CSP, postMessage-only, ready/rendered/error protocol,
   error banner, debounce, panel reuse, editor-title button + context key.
3. **Score viewer** - custom editor for `.mxl` (+ option for text formats), disk watcher.
4. **Localisation** - l10n bundle + nls files, Japanese translation of existing strings.
5. **Release readiness** - identity, LICENSE, icon, README/CHANGELOG, engines/types alignment,
   vsce, lockfile/ignores, CI (GitHub Actions: lint, check-types, test under xvfb, `vsce package`).

## Verification

- `pnpm run check-types`, `pnpm run lint`, `pnpm test` (unit + integration in extension host) all green.
- Integration tests assert the renderer's `rendered` ack for `.musicxml`, `.xml`, `.mxl` fixtures,
  an `error` ack for `broken.musicxml` followed by `rendered` after fixing content, and that
  `not-a-score.xml` gets no preview.
- Manual: F5, open each fixture, use editor-title button, type invalid XML then fix it, open `.mxl`
  from explorer, disconnect network and repeat.
- `pnpm run package:vsix` succeeds; install the `.vsix` in a clean profile (`code --profile-temp`)
  and repeat the manual checks.

## Left to the builder

Head-scan size, debounce interval, CSP fine-tuning, banner styling, icon artwork (placeholder if
none supplied), whether the preview closes with its source, test helper structure.

## Decided with the user

- Approach 2 (command + score viewer); own Marketplace identity; English UI with Japanese kept.
- Publisher not created yet -> placeholder until slice 5; manual publishing; min VS Code 1.140;
  display name "MusicXML Preview".

## Calls made by Claude

- Spec lives at `docs/SPEC.md`; pnpm-only (drop `package-lock.json`); `index.html` kept in repo but
  excluded from the package; OSMD pinned to 3.0.0; `@vscode/vsce` added as devDependency;
  preview stays open after its source closes; white paper background in all themes;
  `score-timewise` gets a message rather than conversion; GitHub Actions CI added in slice 5.
