import * as assert from "assert";
import { bindPreview, PreviewWebview } from "../../preview/previewManager";

// A score whose text closes the inline script and opens its own.
const HOSTILE_SCORE =
  '<score-partwise version="4.0"><credit><credit-words>' +
  "</script><script>window.pwned = true</script>" +
  "</credit-words></credit></score-partwise>";

class FakeWebview implements PreviewWebview {
  html = "";
  readonly cspSource = "https://example.vscode-cdn.net";
  readonly posted: unknown[] = [];
  private listeners: ((message: unknown) => void)[] = [];

  postMessage(message: unknown): Thenable<boolean> {
    this.posted.push(message);
    return Promise.resolve(true);
  }

  onDidReceiveMessage(listener: (message: unknown) => void): { dispose(): void } {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }

  /** Simulate the webview script calling `vscode.postMessage(message)`. */
  receive(message: unknown): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}

function sourceWithText(initial: string): { text: string; getText(): string } {
  return {
    text: initial,
    getText() {
      return this.text;
    },
  };
}

suite("bindPreview", () => {
  test("never writes the document text into the webview HTML", () => {
    const webview = new FakeWebview();
    bindPreview(webview, sourceWithText(HOSTILE_SCORE), "nonce");
    assert.ok(!webview.html.includes("window.pwned"), "document text leaked into the HTML");
  });

  test("sends the document text once the webview reports ready", () => {
    const webview = new FakeWebview();
    bindPreview(webview, sourceWithText(HOSTILE_SCORE), "nonce");
    assert.deepStrictEqual(webview.posted, []);

    webview.receive({ type: "ready" });

    assert.deepStrictEqual(webview.posted, [{ type: "update", content: HOSTILE_SCORE }]);
  });

  test("refresh waits for ready, then sends the latest text", () => {
    const webview = new FakeWebview();
    const source = sourceWithText("<score-partwise/>");
    const binding = bindPreview(webview, source, "nonce");

    binding.refresh();
    assert.deepStrictEqual(webview.posted, []);

    webview.receive({ type: "ready" });
    source.text = "<score-partwise><part-list/></score-partwise>";
    binding.refresh();

    assert.deepStrictEqual(webview.posted, [
      { type: "update", content: "<score-partwise/>" },
      { type: "update", content: "<score-partwise><part-list/></score-partwise>" },
    ]);
  });

  test("ignores messages after dispose", () => {
    const webview = new FakeWebview();
    bindPreview(webview, sourceWithText("<score-partwise/>"), "nonce").dispose();

    webview.receive({ type: "ready" });

    assert.deepStrictEqual(webview.posted, []);
  });
});
