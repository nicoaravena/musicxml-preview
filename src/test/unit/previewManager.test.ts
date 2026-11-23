import * as assert from "assert";
import { bindPreview } from "../../preview/previewManager";
import { ScoreContent } from "../../shared/messages";
import { FakeWebview, flush } from "../helpers/fakeWebview";

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
    bindPreview(webview, () => source.load(), "nonce");
    assert.ok(!webview.html.includes("window.pwned"), "document text leaked into the HTML");
  });

  test("sends the score once the webview reports ready", async () => {
    const webview = new FakeWebview();
    const source = textSource(HOSTILE_SCORE);
    bindPreview(webview, () => source.load(), "nonce");
    await flush();
    assert.deepStrictEqual(webview.posted, []);

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, [
      { type: "update", format: "text", data: HOSTILE_SCORE },
    ]);
  });

  test("refresh waits for ready, then sends the latest score", async () => {
    const webview = new FakeWebview();
    const source = textSource("<score-partwise/>");
    const binding = bindPreview(webview, () => source.load(), "nonce");

    binding.refresh();
    await flush();
    assert.deepStrictEqual(webview.posted, []);

    webview.receive({ type: "ready" });
    await flush();
    source.text = "<score-partwise><part-list/></score-partwise>";
    binding.refresh();
    await flush();

    assert.deepStrictEqual(webview.posted, [
      { type: "update", format: "text", data: "<score-partwise/>" },
      { type: "update", format: "text", data: "<score-partwise><part-list/></score-partwise>" },
    ]);
  });

  test("sends .mxl content as raw bytes", async () => {
    const webview = new FakeWebview();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    bindPreview(webview, () => Promise.resolve({ format: "mxl", data: bytes }), "nonce");

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, [{ type: "update", format: "mxl", data: bytes }]);
    assert.ok((webview.posted[0] as { data: unknown }).data instanceof Uint8Array);
  });

  test("drops a slow earlier load that settles after a newer one", async () => {
    const webview = new FakeWebview();
    const source = controlledSource();
    const binding = bindPreview(webview, source.load, "nonce");

    webview.receive({ type: "ready" });
    binding.refresh();
    const [older, newer] = source.pending;
    newer.resolve({ format: "text", data: "new" });
    await flush();
    older.resolve({ format: "text", data: "old" });
    await flush();

    assert.deepStrictEqual(webview.posted, [{ type: "update", format: "text", data: "new" }]);
  });

  test("posts nothing when the load fails", async () => {
    const webview = new FakeWebview();
    const source = controlledSource();
    bindPreview(webview, source.load, "nonce");

    webview.receive({ type: "ready" });
    source.pending[0].reject(new Error("file deleted"));
    await flush();

    assert.deepStrictEqual(webview.posted, []);
  });

  test("posts nothing when a load settles after dispose", async () => {
    const webview = new FakeWebview();
    const source = controlledSource();
    const binding = bindPreview(webview, source.load, "nonce");

    webview.receive({ type: "ready" });
    binding.dispose();
    source.pending[0].resolve({ format: "text", data: "<score-partwise/>" });
    await flush();

    assert.deepStrictEqual(webview.posted, []);
  });

  test("ignores messages after dispose", async () => {
    const webview = new FakeWebview();
    const source = textSource("<score-partwise/>");
    bindPreview(webview, () => source.load(), "nonce").dispose();

    webview.receive({ type: "ready" });
    await flush();

    assert.deepStrictEqual(webview.posted, []);
  });
});
