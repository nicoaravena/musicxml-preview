import * as assert from "assert";
import {
  bindPreview,
  PREVIEW_DEBOUNCE_MS,
  PreviewManager,
  PreviewPanel,
  RenderResult,
} from "../../preview/previewManager";
import { FakeClock } from "../helpers/fakeClock";
import { FAKE_LOCALE } from "../helpers/fakeLocale";
import { ScoreContent } from "../../shared/messages";
import { FakeWebview, flush } from "../helpers/fakeWebview";

const OPTIONS = {
  nonce: "nonce",
  scriptUri: "https://example.vscode-cdn.net/out/webview.js",
  locale: FAKE_LOCALE,
};

// A score whose text closes the inline script and opens its own.
const HOSTILE_SCORE =
  '<score-partwise version="4.0"><credit><credit-words>' +
  "</script><script>window.pwned = true</script>" +
  "</credit-words></credit></score-partwise>";

/** A loader returning whatever `text` holds at call time, like `document.getText()`. */
function textSource(initial: string): { text: string; load(): Promise<ScoreContent> } {
  return {
    text: initial,
    load() {
      return Promise.resolve({ format: "text", data: this.text });
    },
  };
}

/** A loader whose calls stay pending until the test settles them, in any order. */
function controlledSource(): {
  load(): Promise<ScoreContent>;
  pending: { resolve(content: ScoreContent): void; reject(error: Error): void }[];
} {
  const pending: { resolve(content: ScoreContent): void; reject(error: Error): void }[] = [];
  return {
    pending,
    load: () => new Promise<ScoreContent>((resolve, reject) => pending.push({ resolve, reject })),
  };
}

suite("bindPreview", () => {
  test("never writes the document text into the webview HTML", () => {
    const webview = new FakeWebview();
    const source = textSource(HOSTILE_SCORE);
    bindPreview(webview, () => source.load(), OPTIONS);
    assert.ok(!webview.html.includes("window.pwned"), "document text leaked into the HTML");
  });

  test("sends the score once the webview reports ready", async () => {
    const webview = new FakeWebview();
    const source = textSource(HOSTILE_SCORE);
    bindPreview(webview, () => source.load(), OPTIONS);
    await flush();
    assert.deepStrictEqual(webview.posted, []);

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, [
      { type: "render", version: 1, format: "text", data: HOSTILE_SCORE },
    ]);
  });

  test("refresh waits for ready, then sends the latest score", async () => {
    const webview = new FakeWebview();
    const source = textSource("<score-partwise/>");
    const binding = bindPreview(webview, () => source.load(), OPTIONS);

    binding.refresh();
    await flush();
    assert.deepStrictEqual(webview.posted, []);

    webview.receive({ type: "ready" });
    await flush();
    source.text = "<score-partwise><part-list/></score-partwise>";
    binding.refresh();
    await flush();

    assert.deepStrictEqual(webview.posted, [
      { type: "render", version: 1, format: "text", data: "<score-partwise/>" },
      { type: "render", version: 2, format: "text", data: "<score-partwise><part-list/></score-partwise>" },
    ]);
  });

  test("sends .mxl content as raw bytes", async () => {
    const webview = new FakeWebview();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    bindPreview(webview, () => Promise.resolve({ format: "mxl", data: bytes }), OPTIONS);

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, [{ type: "render", version: 1, format: "mxl", data: bytes }]);
    assert.ok((webview.posted[0] as { data: unknown }).data instanceof Uint8Array);
  });

  test("posts .mxl bytes as a plain Uint8Array even when loaded as a Node Buffer", async () => {
    // workspace.fs.readFile returns a Buffer, which webview postMessage serialises via
    // Buffer.toJSON() as { type: "Buffer", data: [...] } instead of bytes.
    const webview = new FakeWebview();
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    bindPreview(webview, () => Promise.resolve({ format: "mxl", data: buffer }), OPTIONS);

    webview.receive({ type: "ready" });
    await flush();

    const { data } = webview.posted[0] as { data: Uint8Array };
    assert.strictEqual(Object.getPrototypeOf(data), Uint8Array.prototype);
    assert.deepStrictEqual([...data], [0x50, 0x4b, 0x03, 0x04]);
  });

  test("drops a slow earlier load that settles after a newer one", async () => {
    const webview = new FakeWebview();
    const source = controlledSource();
    const binding = bindPreview(webview, source.load, OPTIONS);

    webview.receive({ type: "ready" });
    binding.refresh();
    const [older, newer] = source.pending;
    newer.resolve({ format: "text", data: "new" });
    await flush();
    older.resolve({ format: "text", data: "old" });
    await flush();

    assert.deepStrictEqual(webview.posted, [{ type: "render", version: 2, format: "text", data: "new" }]);
  });

  test("posts a read-failure notice when the load fails", async () => {
    const webview = new FakeWebview();
    const source = controlledSource();
    const results: RenderResult[] = [];
    bindPreview(webview, source.load, { ...OPTIONS, onResult: (result) => results.push(result) });

    webview.receive({ type: "ready" });
    source.pending[0].reject(new Error("file deleted"));
    await flush();

    assert.deepStrictEqual(webview.posted, [
      { type: "notice", version: 1, message: "readFailed" },
    ]);
    assert.deepStrictEqual(results, [{ kind: "notice", version: 1, message: "readFailed" }]);
  });

  test("posts a notice instead of rendering a timewise score", async () => {
    const webview = new FakeWebview();
    const source = textSource('<score-timewise version="4.0"/>');
    const results: RenderResult[] = [];
    bindPreview(webview, () => source.load(), { ...OPTIONS, onResult: (result) => results.push(result) });

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, [{ type: "notice", version: 1, message: "timewise" }]);
    assert.deepStrictEqual(results, [{ kind: "notice", version: 1, message: "timewise" }]);
  });

  test("posts a localised notice instead of rendering an empty document", async () => {
    const webview = new FakeWebview();
    bindPreview(webview, () => Promise.resolve({ format: "text", data: "" }), OPTIONS);

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, [{ type: "notice", version: 1, message: "emptyDocument" }]);
  });

  test("gives the page the localised webview strings and the UI language", () => {
    const webview = new FakeWebview();
    bindPreview(webview, () => Promise.reject(new Error("unused")), OPTIONS);

    assert.ok(webview.html.includes('<html lang="xx">'), "expected the UI language");
    assert.ok(webview.html.includes("renderFailed"), "expected the render-failed string");
    assert.ok(webview.html.includes("notXml"), "expected the not-XML string");
  });

  test("forwards the latest version's acks", async () => {
    const webview = new FakeWebview();
    const source = textSource("<score-partwise/>");
    const results: RenderResult[] = [];
    const binding = bindPreview(webview, () => source.load(), {
      ...OPTIONS,
      onResult: (result) => results.push(result),
    });

    webview.receive({ type: "ready" });
    await flush();
    webview.receive({ type: "rendered", version: 1 });
    binding.refresh();
    await flush();
    webview.receive({ type: "error", version: 2, message: "bad xml" });

    assert.deepStrictEqual(results, [
      { kind: "rendered", version: 1 },
      { kind: "error", version: 2, message: "bad xml" },
    ]);
  });

  test("re-sends on a second ready and ignores the old version's ack", async () => {
    const webview = new FakeWebview();
    const source = textSource("<score-partwise/>");
    const results: RenderResult[] = [];
    bindPreview(webview, () => source.load(), { ...OPTIONS, onResult: (result) => results.push(result) });

    webview.receive({ type: "ready" });
    await flush();
    webview.receive({ type: "ready" });
    await flush();
    webview.receive({ type: "rendered", version: 1 });

    assert.deepStrictEqual(
      webview.posted.map((message) => (message as { version: number }).version),
      [1, 2],
    );
    assert.deepStrictEqual(results, []);
  });

  test("ignores malformed acks", async () => {
    const webview = new FakeWebview();
    const source = textSource("<score-partwise/>");
    const results: RenderResult[] = [];
    bindPreview(webview, () => source.load(), { ...OPTIONS, onResult: (result) => results.push(result) });

    webview.receive({ type: "ready" });
    await flush();
    webview.receive({ type: "rendered" });
    webview.receive({ type: "error", version: 1 });

    assert.deepStrictEqual(results, []);
  });

  test("posts nothing when a load settles after dispose", async () => {
    const webview = new FakeWebview();
    const source = controlledSource();
    const binding = bindPreview(webview, source.load, OPTIONS);

    webview.receive({ type: "ready" });
    binding.dispose();
    source.pending[0].resolve({ format: "text", data: "<score-partwise/>" });
    await flush();

    assert.deepStrictEqual(webview.posted, []);
  });

  test("ignores messages after dispose", async () => {
    const webview = new FakeWebview();
    const source = textSource("<score-partwise/>");
    bindPreview(webview, () => source.load(), OPTIONS).dispose();

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, []);
  });
});

/** In-memory preview panel: a FakeWebview plus reveal/dispose bookkeeping. */
class FakePanel implements PreviewPanel {
  readonly webview = new FakeWebview();
  readonly scriptUri = OPTIONS.scriptUri;
  reveals = 0;
  private disposeListeners: (() => void)[] = [];

  constructor(readonly title: string) {}

  reveal(): void {
    this.reveals++;
  }

  onDidDispose(listener: () => void): { dispose(): void } {
    this.disposeListeners.push(listener);
    return { dispose: () => (this.disposeListeners = this.disposeListeners.filter((l) => l !== listener)) };
  }

  /** Simulate the user closing the panel. */
  close(): void {
    this.disposeListeners.forEach((listener) => listener());
  }
}

function setupManager() {
  const clock = new FakeClock();
  const panels: FakePanel[] = [];
  const texts = new Map<string, string>();
  const results: [string, RenderResult][] = [];
  const manager = new PreviewManager({
    createPanel: (title) => {
      const panel = new FakePanel(title);
      panels.push(panel);
      return panel;
    },
    readText: (key) => texts.get(key),
    createNonce: () => "nonce",
    locale: FAKE_LOCALE,
    clock,
    onResult: (key, result) => results.push([key, result]),
  });
  return { clock, panels, texts, results, manager };
}

const KEY = "file:///scores/hello.musicxml";

suite("PreviewManager", () => {
  test("opens one panel with the localised title for hello.musicxml", () => {
    const { manager, panels } = setupManager();
    manager.show(KEY, "/scores/hello.musicxml");
    assert.deepStrictEqual(
      panels.map((panel) => panel.title),
      ["previewTitle|hello.musicxml"],
    );
  });

  test("reveals instead of opening a second panel for the same document", () => {
    const { manager, panels } = setupManager();
    manager.show(KEY, "/scores/hello.musicxml");
    manager.show(KEY, "/scores/hello.musicxml");
    assert.strictEqual(panels.length, 1);
    assert.strictEqual(panels[0].reveals, 1);
  });

  test("opens separate panels for separate documents", () => {
    const { manager, panels } = setupManager();
    manager.show(KEY, "/scores/hello.musicxml");
    manager.show("file:///scores/other.xml", "/scores/other.xml");
    assert.strictEqual(panels.length, 2);
  });

  test("renders the document's current text once the webview is ready", async () => {
    const { manager, panels, texts } = setupManager();
    texts.set(KEY, "<score-partwise/>");
    manager.show(KEY, "/scores/hello.musicxml");
    panels[0].webview.receive({ type: "ready" });
    await flush();
    assert.deepStrictEqual(panels[0].webview.posted, [
      { type: "render", version: 1, format: "text", data: "<score-partwise/>" },
    ]);
  });

  test("coalesces changes within 300 ms", async () => {
    const { manager, panels, texts, clock } = setupManager();
    texts.set(KEY, "<score-partwise/>");
    manager.show(KEY, "/scores/hello.musicxml");
    const { webview } = panels[0];
    webview.receive({ type: "ready" });
    await flush();

    for (const text of ["<score-partwise a/>", "<score-partwise b/>", "<score-partwise c/>"]) {
      texts.set(KEY, text);
      manager.documentChanged(KEY);
      if (text !== "<score-partwise c/>") {
        clock.advance(100);
      }
    }
    clock.advance(PREVIEW_DEBOUNCE_MS - 1);
    await flush();
    assert.strictEqual(webview.posted.length, 1, "rendered before the debounce elapsed");

    clock.advance(1);
    await flush();
    assert.deepStrictEqual(webview.posted.slice(1), [
      { type: "render", version: 2, format: "text", data: "<score-partwise c/>" },
    ]);
  });

  test("ignores changes for documents without a preview", async () => {
    const { manager, clock } = setupManager();
    manager.documentChanged(KEY);
    clock.advance(PREVIEW_DEBOUNCE_MS);
    await flush();
  });

  test("drops a pending refresh when the panel closes", async () => {
    const { manager, panels, texts, clock } = setupManager();
    texts.set(KEY, "<score-partwise/>");
    manager.show(KEY, "/scores/hello.musicxml");
    const panel = panels[0];
    panel.webview.receive({ type: "ready" });
    await flush();

    manager.documentChanged(KEY);
    panel.close();
    clock.advance(PREVIEW_DEBOUNCE_MS);
    await flush();

    assert.strictEqual(panel.webview.posted.length, 1);
  });

  test("opens a fresh panel after the previous one closed", () => {
    const { manager, panels } = setupManager();
    manager.show(KEY, "/scores/hello.musicxml");
    panels[0].close();
    manager.show(KEY, "/scores/hello.musicxml");
    assert.strictEqual(panels.length, 2);
    assert.strictEqual(panels[0].reveals, 0);
  });

  test("shows a read-failure notice when the document is no longer open", async () => {
    const { manager, panels } = setupManager();
    manager.show(KEY, "/scores/hello.musicxml");
    panels[0].webview.receive({ type: "ready" });
    await flush();
    assert.deepStrictEqual(panels[0].webview.posted, [
      { type: "notice", version: 1, message: "readFailed" },
    ]);
  });

  test("reports results with the document key", async () => {
    const { manager, panels, texts, results } = setupManager();
    texts.set(KEY, "<score-partwise/>");
    manager.show(KEY, "/scores/hello.musicxml");
    panels[0].webview.receive({ type: "ready" });
    await flush();
    panels[0].webview.receive({ type: "rendered", version: 1 });
    assert.deepStrictEqual(results, [[KEY, { kind: "rendered", version: 1 }]]);
  });
});
