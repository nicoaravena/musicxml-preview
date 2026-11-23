import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

const COMMAND = "musicxmlPreview.showPreviewToSide";
// out/test/integration -> src/test/fixtures (tsc does not copy fixtures into out/).
const FIXTURES = path.resolve(__dirname, "../../../src/test/fixtures");

async function openFixture(name: string): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(path.join(FIXTURES, name));
  await vscode.window.showTextDocument(document);
  return document;
}

function previewTabCount(): number {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith("musicxmlPreview"),
    ).length;
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

suite("Open Preview to the Side command", () => {
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  // Files starting with "<?xml" are already XML via the built-in firstLine rule, so use a
  // fixture without a declaration to exercise the .musicxml extension mapping.
  test(".musicxml without an XML declaration opens as XML", async () => {
    const document = await openFixture("no-declaration.musicxml");
    assert.strictEqual(document.languageId, "xml");
  });

  for (const fixture of ["hello.musicxml", "hello.xml"]) {
    test(`opens a preview for ${fixture}`, async () => {
      await openFixture(fixture);
      await vscode.commands.executeCommand(COMMAND);
      assert.ok(await waitFor(() => previewTabCount() === 1), "expected one preview tab");
    });
  }

  test("does not open a preview for a non-score .xml", async () => {
    await openFixture("not-a-score.xml");
    await vscode.commands.executeCommand(COMMAND);
    assert.strictEqual(await waitFor(() => previewTabCount() > 0, 500), false);
  });
});
