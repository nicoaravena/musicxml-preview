// End to end: the real extension, the real webview and the bundled OSMD renderer.
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { english } from "../../shared/uiStrings";
import { FIXTURES, fixtureUri, getApi, nextResult, openFixture, waitFor } from "../helpers/integration";

const COMMAND = "musicxmlPreview.showPreviewToSide";

function previewTabCount(): number {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith("musicxmlPreview"),
    ).length;
}

suite("Rendering", () => {
  teardown(async () => {
    // Undo test edits so closing the editors never prompts to save.
    for (const document of vscode.workspace.textDocuments.filter((d) => d.isDirty)) {
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("workbench.action.files.revert");
    }
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  for (const fixture of ["hello.musicxml", "hello.xml"]) {
    test(`the preview renders ${fixture}`, async () => {
      const api = await getApi();
      const uri = fixtureUri(fixture);
      const result = nextResult(api, uri);

      await openFixture(fixture);
      await vscode.commands.executeCommand(COMMAND);

      assert.deepStrictEqual(await result, { kind: "rendered", version: 1 });
    });
  }

  test("the score viewer renders hello.mxl", async () => {
    const api = await getApi();
    const uri = fixtureUri("hello.mxl");
    const result = nextResult(api, uri);

    await vscode.commands.executeCommand("vscode.open", uri);

    assert.deepStrictEqual(await result, { kind: "rendered", version: 1 });
  });

  test("a broken score reports an error, and fixing it renders", async () => {
    const api = await getApi();
    const uri = fixtureUri("broken.musicxml");
    const failed = nextResult(api, uri);

    const document = await openFixture("broken.musicxml");
    await vscode.commands.executeCommand(COMMAND);
    const error = await failed;
    assert.strictEqual(error.kind, "error");

    const fixed = nextResult(api, uri, (result) => result.kind === "rendered");
    const edit = new vscode.WorkspaceEdit();
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    edit.replace(uri, whole, fs.readFileSync(path.join(FIXTURES, "hello.musicxml"), "utf8"));
    assert.ok(await vscode.workspace.applyEdit(edit));

    assert.strictEqual((await fixed).kind, "rendered");
  });

  test("score-timewise gets a notice instead of a render", async () => {
    const api = await getApi();
    const uri = fixtureUri("timewise.musicxml");
    const result = nextResult(api, uri);

    await openFixture("timewise.musicxml");
    await vscode.commands.executeCommand(COMMAND);

    assert.deepStrictEqual(await result, { kind: "notice", version: 1, message: english("timewise") });
  });

  test("the editor-title button previews the editor it belongs to, not the active one", async () => {
    // VS Code passes the clicked editor's URI; another editor may be active (e.g. a split).
    const api = await getApi();
    const uri = fixtureUri("hello.musicxml");
    const result = nextResult(api, uri);

    await openFixture("hello.musicxml");
    await openFixture("not-a-score.xml");
    await vscode.commands.executeCommand(COMMAND, uri);

    assert.deepStrictEqual(await result, { kind: "rendered", version: 1 });
  });

  test("running the command twice keeps one preview tab", async () => {
    await openFixture("hello.musicxml");
    await vscode.commands.executeCommand(COMMAND);
    assert.ok(await waitFor(() => previewTabCount() === 1), "expected one preview tab");

    await vscode.window.showTextDocument(fixtureUri("hello.musicxml"));
    await vscode.commands.executeCommand(COMMAND);

    assert.strictEqual(await waitFor(() => previewTabCount() > 1, 500), false);
  });
});
