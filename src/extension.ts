// Composition root: wires VS Code to the preview manager, the score viewer and the context key.
import { randomBytes } from "crypto";
import * as vscode from "vscode";
import { classifyScoreFile, SCORE_HEAD_CHARS } from "./domain/scoreFile";
import { PreviewManager, RenderResult } from "./preview/previewManager";
import {
  defaultScoreViewerDeps,
  SCORE_VIEWER_VIEW_TYPE,
  ScoreViewerProvider,
} from "./preview/scoreViewer";

/** Drives the editor-title button for `.xml` scores (`.musicxml` matches by extension). */
const IS_SCORE_CONTEXT_KEY = "musicxmlPreview.isScore";

/**
 * Returned from `activate`. Internal: integration tests use it to see what the renderer reported;
 * it is not a supported API for other extensions.
 */
export interface MusicXmlPreviewApi {
  readonly onDidRender: vscode.Event<{ uri: string; result: RenderResult }>;
}

function isTextScore(document: vscode.TextDocument): boolean {
  const head = document.getText(
    new vscode.Range(new vscode.Position(0, 0), document.positionAt(SCORE_HEAD_CHARS)),
  );
  return classifyScoreFile(document.fileName, head).kind === "text";
}

async function documentFor(uri: unknown): Promise<vscode.TextDocument | undefined> {
  if (!(uri instanceof vscode.Uri)) {
    return vscode.window.activeTextEditor?.document;
  }
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  try {
    return open ?? (await vscode.workspace.openTextDocument(uri));
  } catch {
    return undefined;
  }
}

function updateScoreContext(editor: vscode.TextEditor | undefined): void {
  void vscode.commands.executeCommand(
    "setContext",
    IS_SCORE_CONTEXT_KEY,
    editor !== undefined && isTextScore(editor.document),
  );
}

export function activate(context: vscode.ExtensionContext): MusicXmlPreviewApi {
  // The bundled renderer lives in out/; webviews may load nothing else from disk.
  const outUri = vscode.Uri.joinPath(context.extensionUri, "out");
  const rendered = new vscode.EventEmitter<{ uri: string; result: RenderResult }>();
  const createNonce = (): string => randomBytes(16).toString("base64");

  const previews = new PreviewManager({
    createPanel: (title) => {
      const panel = vscode.window.createWebviewPanel(
        "musicxmlPreview",
        title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [outUri] },
      );
      return {
        webview: panel.webview,
        scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(outUri, "webview.js")).toString(),
        reveal: () => panel.reveal(undefined, true),
        onDidDispose: (listener) => panel.onDidDispose(listener),
      };
    },
    readText: (key) =>
      vscode.workspace.textDocuments.find((document) => document.uri.toString() === key)?.getText(),
    createNonce,
    clock: { setTimeout, clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout) },
    onResult: (uri, result) => rendered.fire({ uri, result }),
  });

  context.subscriptions.push(
    rendered,
    previews,
    // The editor-title button passes its editor's URI, which need not be the active editor
    // (split groups, focused preview); the Command Palette passes nothing.
    vscode.commands.registerCommand("musicxmlPreview.showPreviewToSide", async (uri?: unknown) => {
      const document = await documentFor(uri);
      if (!document || !isTextScore(document)) {
        vscode.window.showErrorMessage("The active file is not a MusicXML score.");
        return;
      }
      previews.show(document.uri.toString(), document.fileName);
    }),
    vscode.workspace.onDidChangeTextDocument((event) =>
      previews.documentChanged(event.document.uri.toString()),
    ),
    vscode.window.onDidChangeActiveTextEditor(updateScoreContext),
    vscode.window.registerCustomEditorProvider(
      SCORE_VIEWER_VIEW_TYPE,
      new ScoreViewerProvider({
        ...defaultScoreViewerDeps,
        scriptRoot: outUri,
        onResult: (uri, result) => rendered.fire({ uri, result }),
      }),
    ),
  );
  updateScoreContext(vscode.window.activeTextEditor);

  return { onDidRender: rendered.event };
}

export function deactivate() {}
