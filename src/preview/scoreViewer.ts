// Read-only score viewer: a custom editor that renders a score file from disk
// (docs/SPEC.md "Score viewer"). Default editor for `.mxl`, which has no text editor to preview from.
import { randomBytes } from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { bindPreview } from "./previewManager";

export const SCORE_VIEWER_VIEW_TYPE = "musicxmlPreview.scoreViewer";

/** The parts of `vscode.FileSystemWatcher` the viewer uses. */
export interface FileWatch extends vscode.Disposable {
  readonly onDidChange: vscode.Event<vscode.Uri>;
  readonly onDidCreate: vscode.Event<vscode.Uri>;
}

/** I/O the viewer needs, injected so it can be unit-tested without real files. */
export interface ScoreViewerDeps {
  readFile(uri: vscode.Uri): Thenable<Uint8Array>;
  watchFile(uri: vscode.Uri): FileWatch;
  createNonce(): string;
}

export const defaultScoreViewerDeps: ScoreViewerDeps = {
  // workspace.fs rather than node fs so remote and WSL workspaces work.
  readFile: (uri) => vscode.workspace.fs.readFile(uri),
  watchFile: (uri) =>
    vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(uri, ".."), path.posix.basename(uri.path)),
    ),
  createNonce: () => randomBytes(16).toString("base64"),
};

export class ScoreViewerProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly deps: ScoreViewerDeps = defaultScoreViewerDeps) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
    // Only `.mxl` is registered for this viewer today; text formats are a follow-up.
    panel.webview.options = { enableScripts: true };
    const binding = bindPreview(
      panel.webview,
      () => Promise.resolve(this.deps.readFile(document.uri)).then((data) => ({ format: "mxl", data })),
      this.deps.createNonce(),
    );

    // Editors such as MuseScore may rewrite the file in place or delete and re-create it.
    const watch = this.deps.watchFile(document.uri);
    const subscriptions = [
      watch,
      watch.onDidChange(() => binding.refresh()),
      watch.onDidCreate(() => binding.refresh()),
      binding,
    ];
    panel.onDidDispose(() => subscriptions.forEach((subscription) => subscription.dispose()));
  }
}
