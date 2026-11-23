import * as assert from "assert";
import * as vscode from "vscode";
import { fixtureUri, waitFor } from "../helpers/integration";

const VIEW_TYPE = "musicxmlPreview.scoreViewer";

function scoreViewerTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === VIEW_TYPE);
}

suite("Score viewer", () => {
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test(".mxl opens in the score viewer by default", async () => {
    const uri = fixtureUri("hello.mxl");

    await vscode.commands.executeCommand("vscode.open", uri);

    assert.ok(await waitFor(() => scoreViewerTabs().length === 1), "expected a score viewer tab");
    const input = scoreViewerTabs()[0].input as vscode.TabInputCustom;
    assert.strictEqual(input.uri.toString(), uri.toString());
  });

  test(".musicxml still opens as text", async () => {
    const uri = fixtureUri("hello.musicxml");

    await vscode.commands.executeCommand("vscode.open", uri);

    assert.ok(await waitFor(() => vscode.window.activeTextEditor !== undefined));
    assert.strictEqual(scoreViewerTabs().length, 0);
  });
});
