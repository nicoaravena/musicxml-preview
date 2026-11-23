// Read-only score viewer: a custom editor that renders a score file from disk
// (docs/SPEC.md "Score viewer"). Default editor for `.mxl`, which has no text editor to preview from.
import { randomBytes } from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { bindPreview, RenderResult } from "./previewManager";

export const SCORE_VIEWER_VIEW_TYPE = "musicxmlPreview.scoreViewer";

/** The parts of `vscode.FileSystemWatcher` the viewer uses. */
export interface FileWatch extends vscode.Disposable {
  readonly onDidChange: vscode.Event<vscode.Uri>;
  readonly onDidCreate: vscode.Event<vscode.Uri>;
  readonly onDidDelete: vscode.Event<vscode.Uri>;
}

/** I/O the viewer needs, injected so it can be unit-tested without real files. */
export interface ScoreViewerDeps {
  readFile(uri: vscode.Uri): Thenable<Uint8Array>;
  watchFile(uri: vscode.Uri): FileWatch;
  createNonce(): string;
  /** The extension's `out/` folder: holds the bundled renderer and is the only local resource root. */
  scriptRoot: vscode.Uri;
  onResult?(uri: string, result: RenderResult): void;
}

/** File system and nonce defaults; the composition root adds `scriptRoot` and `onResult`. */
export const defaultScoreViewerDeps: Pick<ScoreViewerDeps, "readFile" | "watchFile" | "createNonce"> = {
  // workspace.fs rather than node fs so remote and WSL workspaces work.
  readFile: (uri) => vscode.workspace.fs.readFile(uri),
  watchFile: (uri) =>
    vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(uri, ".."), path.posix.basename(uri.path)),
    ),
  createNonce: () => randomBytes(16).toString("base64"),
};

export class ScoreViewerProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly deps: ScoreViewerDeps) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
    // Only `.mxl` is registered for this viewer today; text formats are a follow-up.
    const { scriptRoot } = this.deps;
    panel.webview.options = { enableScripts: true, localResourceRoots: [scriptRoot] };
    const binding = bindPreview(
      panel.webview,
      () => Promise.resolve(this.deps.readFile(document.uri)).then((data) => ({ format: "mxl", data })),
      {
        nonce: this.deps.createNonce(),
        scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(scriptRoot, "webview.js")).toString(),
        onResult: (result) => this.deps.onResult?.(document.uri.toString(), result),
      },
    );

    // Editors such as MuseScore may rewrite the file in place or delete and re-create it.
    const watch = this.deps.watchFile(document.uri);
    const subscriptions = [
      watch,
      watch.onDidChange(() => binding.refresh()),
      watch.onDidCreate(() => binding.refresh()),
      // The read fails, so the viewer shows a notice above the last render.
      watch.onDidDelete(() => binding.refresh()),
      binding,
    ];
    panel.onDidDispose(() => subscriptions.forEach((subscription) => subscription.dispose()));
  }
}
