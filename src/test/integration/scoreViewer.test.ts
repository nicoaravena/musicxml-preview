import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

const VIEW_TYPE = "musicxmlPreview.scoreViewer";
// out/test/integration -> src/test/fixtures (tsc does not copy fixtures into out/).
const FIXTURES = path.resolve(__dirname, "../../../src/test/fixtures");

function scoreViewerTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === VIEW_TYPE);
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return condition();
}

suite("Score viewer", () => {
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test(".mxl opens in the score viewer by default", async () => {
    const uri = vscode.Uri.file(path.join(FIXTURES, "hello.mxl"));

    await vscode.commands.executeCommand("vscode.open", uri);

    assert.ok(await waitFor(() => scoreViewerTabs().length === 1), "expected a score viewer tab");
    const input = scoreViewerTabs()[0].input as vscode.TabInputCustom;
    assert.strictEqual(input.uri.toString(), uri.toString());
  });

  test(".musicxml still opens as text", async () => {
    const uri = vscode.Uri.file(path.join(FIXTURES, "hello.musicxml"));

    await vscode.commands.executeCommand("vscode.open", uri);

    assert.ok(await waitFor(() => vscode.window.activeTextEditor !== undefined));
    assert.strictEqual(scoreViewerTabs().length, 0);
  });
});
