import * as assert from "assert";
import * as vscode from "vscode";
import { READ_FAILED_MESSAGE, RenderResult } from "../../preview/previewManager";
import { ScoreViewerProvider } from "../../preview/scoreViewer";
import { FakeWebview, flush } from "../helpers/fakeWebview";

const SCORE_URI = vscode.Uri.file("/scores/hello.mxl");
const SCRIPT_ROOT = vscode.Uri.file("/extension/out");

/** Fake file system for one file: its bytes can change, and the test fires watcher events. */
class FakeScoreFile {
  bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]);
  readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly created = new vscode.EventEmitter<vscode.Uri>();
  readonly deleted = new vscode.EventEmitter<vscode.Uri>();
  /** Set to make reads fail, as after the file was deleted. */
  missing = false;
  watched: vscode.Uri | undefined;
  watchDisposed = false;
  readonly results: [string, RenderResult][] = [];

  readonly deps = {
    readFile: (uri: vscode.Uri): Thenable<Uint8Array> => {
      assert.strictEqual(uri.toString(), SCORE_URI.toString());
      return this.missing ? Promise.reject(new Error("ENOENT")) : Promise.resolve(this.bytes);
    },
    watchFile: (uri: vscode.Uri) => {
      this.watched = uri;
      return {
        onDidChange: this.changed.event,
        onDidCreate: this.created.event,
        onDidDelete: this.deleted.event,
        dispose: () => (this.watchDisposed = true),
      };
    },
    createNonce: () => "nonce",
    scriptRoot: SCRIPT_ROOT,
    onResult: (uri: string, result: RenderResult) => this.results.push([uri, result]),
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
  test("lets the renderer script run, loading local resources only from out/", async () => {
    const { webview } = await openViewer(new FakeScoreFile());
    assert.deepStrictEqual(webview.options, { enableScripts: true, localResourceRoots: [SCRIPT_ROOT] });
  });

  test("loads the bundled renderer from out/", async () => {
    const { webview } = await openViewer(new FakeScoreFile());
    const script = vscode.Uri.joinPath(SCRIPT_ROOT, "webview.js").toString();
    assert.ok(webview.html.includes(`src="${script}"`), "expected the bundled renderer script");
  });

  test("reports render results with the file's URI", async () => {
    const file = new FakeScoreFile();
    const { webview } = await openViewer(file);
    webview.receive({ type: "ready" });
    await flush();
    webview.receive({ type: "rendered", version: 1 });
    assert.deepStrictEqual(file.results, [[SCORE_URI.toString(), { kind: "rendered", version: 1 }]]);
  });

  test("sends the file's bytes as mxl once the webview is ready", async () => {
    const file = new FakeScoreFile();
    const { webview } = await openViewer(file);

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, [{ type: "render", version: 1, format: "mxl", data: file.bytes }]);
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
        type: "render",
        version: 2,
        format: "mxl",
        data: file.bytes,
      });
    });
  }

  test("shows a read-failure notice when the file is deleted", async () => {
    const file = new FakeScoreFile();
    const { webview } = await openViewer(file);
    webview.receive({ type: "ready" });
    await flush();

    file.missing = true;
    file.deleted.fire(SCORE_URI);
    await flush();

    assert.deepStrictEqual(webview.posted.at(-1), {
      type: "notice",
      version: 2,
      message: READ_FAILED_MESSAGE,
    });
  });

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
