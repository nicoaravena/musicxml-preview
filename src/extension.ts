import { randomBytes } from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { classifyScoreFile, SCORE_HEAD_CHARS } from "./domain/scoreFile";
import { bindPreview } from "./preview/previewManager";

function isTextScore(document: vscode.TextDocument): boolean {
  const head = document.getText(
    new vscode.Range(new vscode.Position(0, 0), document.positionAt(SCORE_HEAD_CHARS)),
  );
  return classifyScoreFile(document.fileName, head).kind === "text";
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("musicxmlPreview.showPreviewToSide", () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document || !isTextScore(document)) {
        vscode.window.showErrorMessage("The active file is not a MusicXML score.");
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        "musicxmlPreview",
        `Preview ${path.basename(document.fileName)}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      const binding = bindPreview(panel.webview, document, randomBytes(16).toString("base64"));

      const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === document.uri.toString()) {
          binding.refresh();
        }
      });

      panel.onDidDispose(() => {
        changeDocumentSubscription.dispose();
        binding.dispose();
      });
    })
  );
}

export function deactivate() { }
