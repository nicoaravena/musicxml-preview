import * as assert from "assert";
import * as vscode from "vscode";
import { ScoreViewerProvider } from "../../preview/scoreViewer";
import { FakeWebview, flush } from "../helpers/fakeWebview";

const SCORE_URI = vscode.Uri.file("/scores/hello.mxl");

/** Fake file system for one file: its bytes can change, and the test fires watcher events. */
class FakeScoreFile {
  bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]);
  readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly created = new vscode.EventEmitter<vscode.Uri>();
  watched: vscode.Uri | undefined;
  watchDisposed = false;

  readonly deps = {
    readFile: (uri: vscode.Uri): Thenable<Uint8Array> => {
      assert.strictEqual(uri.toString(), SCORE_URI.toString());
      return Promise.resolve(this.bytes);
    },
    watchFile: (uri: vscode.Uri) => {
      this.watched = uri;
      return {
        onDidChange: this.changed.event,
        onDidCreate: this.created.event,
        dispose: () => (this.watchDisposed = true),
      };
    },
    createNonce: () => "nonce",
  };
}

async function openViewer(file: FakeScoreFile): Promise<{
  webview: FakeWebview;
  close(): void;
}> {
  const provider = new ScoreViewerProvider(file.deps);
  const webview = new FakeWebview();
  const disposed = new vscode.EventEmitter<void>();
  const panel = { webview, onDidDispose: disposed.event } as unknown as vscode.WebviewPanel;

  await provider.resolveCustomEditor(provider.openCustomDocument(SCORE_URI), panel);
  return { webview, close: () => disposed.fire() };
}

suite("ScoreViewerProvider", () => {
  test("lets the renderer script run", async () => {
    const { webview } = await openViewer(new FakeScoreFile());
    assert.deepStrictEqual(webview.options, { enableScripts: true });
  });

  test("sends the file's bytes as mxl once the webview is ready", async () => {
    const file = new FakeScoreFile();
    const { webview } = await openViewer(file);

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, [{ type: "update", format: "mxl", data: file.bytes }]);
  });

  test("watches the opened file", async () => {
    const file = new FakeScoreFile();
    await openViewer(file);
    assert.strictEqual(file.watched?.toString(), SCORE_URI.toString());
  });

  for (const [event, fire] of [
    ["changes", (file: FakeScoreFile) => file.changed.fire(SCORE_URI)],
    ["is re-created", (file: FakeScoreFile) => file.created.fire(SCORE_URI)],
  ] as const) {
    test(`re-sends the file when it ${event} on disk`, async () => {
      const file = new FakeScoreFile();
      const { webview } = await openViewer(file);
      webview.receive({ type: "ready" });
      await flush();

      file.bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 2]);
      fire(file);
      await flush();

      assert.deepStrictEqual(webview.posted.at(-1), {
        type: "update",
        format: "mxl",
        data: file.bytes,
      });
    });
  }

  test("stops watching when the viewer closes", async () => {
    const file = new FakeScoreFile();
    const { webview, close } = await openViewer(file);
    webview.receive({ type: "ready" });
    await flush();

    close();
    file.changed.fire(SCORE_URI);
    await flush();

    assert.strictEqual(file.watchDisposed, true);
    assert.strictEqual(webview.posted.length, 1);
  });
});
