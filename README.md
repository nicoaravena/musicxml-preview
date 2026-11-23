# MusicXML Preview

See MusicXML scores rendered as sheet music inside VS Code. Edit a `.musicxml` file and watch the
score update beside it, or open a compressed `.mxl` file the way you would open an image. Rendering
is done by [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/), which ships with the
extension, so it works offline.

## Features

- **Live preview to the side** for text MusicXML. The preview follows your unsaved edits.
- **Score viewer for `.mxl`**: compressed MusicXML opens rendered by default and reloads when the
  file changes on disk, for example after you export again from MuseScore.
- **Forgiving errors**: if an edit breaks the XML, the last good render stays on screen with an
  error banner above it. Fix the XML and the banner goes away.
- **One preview per file**: running the command again brings the existing preview to the front.
- **Leaves other XML alone**: `.xml` files count as scores only when their root element is
  `score-partwise`.

## Supported files

| File | How it opens |
| --- | --- |
| `.musicxml` | Text editor, with the preview button in the title bar |
| `.xml` with a `<score-partwise>` root | Text editor, with the preview button in the title bar |
| `.mxl` (compressed MusicXML) | Rendered score viewer |

`score-timewise` documents are detected but not rendered, because OpenSheetMusicDisplay does not
support them. Convert them to `score-partwise` first.

## Usage

1. Open a `.musicxml` file or a MusicXML `.xml` file.
2. Click the **Open Preview to the Side** button in the editor title bar, or run
   **MusicXML: Open Preview to the Side** from the Command Palette
   (`Ctrl+Shift+P` / `Cmd+Shift+P`).

To view a `.mxl` file, open it from the Explorer.

## Privacy

The extension makes no network requests and collects no telemetry. The renderer is bundled with
the extension, and your files never leave your machine.

## Requirements

VS Code 1.140 or later.

## Languages

English (default) and Japanese.

## Credits

Forked from [Suzushiro-radish/musicxml-preview](https://github.com/Suzushiro-radish/musicxml-preview).
Scores are rendered with [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)
(BSD-3-Clause). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the licenses of all bundled
code.

## License

[MIT](LICENSE)
