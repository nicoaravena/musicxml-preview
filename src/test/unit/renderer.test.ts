import * as assert from "assert";
import { WebviewMessage } from "../../shared/messages";
import { createRenderer } from "../../webview/renderer";
import { flush } from "../helpers/fakeWebview";

/** A stage whose `show` calls stay pending until the test settles them. */
class FakeStage {
  readonly shown: (string | Blob)[] = [];
  readonly pending: { resolve(): void; reject(error: unknown): void }[] = [];

  show(input: string | Blob): Promise<void> {
    this.shown.push(input);
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }
}

class RecordingBanner {
  readonly calls: string[] = [];
  show(message: string): void {
    this.calls.push(`show:${message}`);
  }
  clear(): void {
    this.calls.push("clear");
  }
}

const STRINGS = { renderFailed: "Render failed.", notXml: "Not XML." };

function setup() {
  const stage = new FakeStage();
  const banner = new RecordingBanner();
  const posted: WebviewMessage[] = [];
  const renderer = createRenderer({
    stage,
    banner,
    strings: STRINGS,
    post: (message) => posted.push(message),
  });
  return { stage, banner, posted, renderer };
}

const text = (version: number, data = `<score-partwise v="${version}"/>`) =>
  ({ type: "render", version, format: "text", data }) as const;

suite("webview renderer", () => {
  test("posts ready on start", () => {
    const { renderer, posted } = setup();
    renderer.start();
    assert.deepStrictEqual(posted, [{ type: "ready" }]);
  });

  test("passes text as a string and mxl as a Blob", async () => {
    const { renderer, stage } = setup();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    void renderer.handle(text(1, "<score-partwise/>"));
    stage.pending[0].resolve();
    await flush();
    void renderer.handle({ type: "render", version: 2, format: "mxl", data: bytes });
    stage.pending[1].resolve();
    await flush();

    assert.strictEqual(stage.shown[0], "<score-partwise/>");
    const blob = stage.shown[1];
    assert.ok(blob instanceof Blob, "expected a Blob");
    assert.deepStrictEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  });

  test("acks a successful render and clears the banner", async () => {
    const { renderer, stage, banner, posted } = setup();
    const done = renderer.handle(text(1));
    stage.pending[0].resolve();
    await done;

    assert.deepStrictEqual(posted, [{ type: "rendered", version: 1 }]);
    assert.deepStrictEqual(banner.calls, ["clear"]);
  });

  test("reports a failure in the banner and recovers", async () => {
    const { renderer, stage, banner, posted } = setup();
    const failed = renderer.handle(text(1));
    stage.pending[0].reject(new Error("bad xml"));
    await failed;
    const fixed = renderer.handle(text(2));
    stage.pending[1].resolve();
    await fixed;

    assert.deepStrictEqual(posted, [
      { type: "error", version: 1, message: "bad xml" },
      { type: "rendered", version: 2 },
    ]);
    assert.deepStrictEqual(banner.calls, ["show:bad xml", "clear"]);
  });

  test("reports non-Error failures", async () => {
    const { renderer, stage, posted } = setup();
    const first = renderer.handle(text(1));
    stage.pending[0].reject("boom");
    await first;
    const second = renderer.handle(text(2));
    stage.pending[1].reject(undefined);
    await second;

    assert.deepStrictEqual(posted, [
      { type: "error", version: 1, message: "boom" },
      { type: "error", version: 2, message: STRINGS.renderFailed },
    ]);
  });

  test("runs only the newest render queued while busy", async () => {
    const { renderer, stage, posted } = setup();
    const done = renderer.handle(text(1));
    void renderer.handle(text(2));
    void renderer.handle(text(3));

    stage.pending[0].resolve();
    await flush();
    assert.strictEqual(stage.pending.length, 2, "expected the next render to start");
    stage.pending[1].resolve();
    await done;

    assert.deepStrictEqual(stage.shown, [text(1).data, text(3).data]);
    assert.deepStrictEqual(posted.at(-1), { type: "rendered", version: 3 });
  });

  test("a superseded render does not touch the banner", async () => {
    const { renderer, stage, banner } = setup();
    const done = renderer.handle(text(1));
    void renderer.handle({ type: "notice", version: 2, message: "This document is empty." });
    stage.pending[0].resolve();
    await done;

    assert.deepStrictEqual(banner.calls, ["show:This document is empty."]);
    assert.strictEqual(stage.shown.length, 1, "the notice must not trigger a render");
  });

  test("never hands OSMD text it would fetch as a URL", async () => {
    // OSMD's load() requests any string that does not start with "<" as a URL.
    const { renderer, stage, banner, posted } = setup();
    await renderer.handle(text(1, "https://example.com/score.musicxml"));

    assert.deepStrictEqual(stage.shown, []);
    assert.deepStrictEqual(posted, [{ type: "error", version: 1, message: STRINGS.notXml }]);
    assert.deepStrictEqual(banner.calls, [`show:${STRINGS.notXml}`]);
  });

  test("shows a notice without rendering", async () => {
    const { renderer, stage, banner, posted } = setup();
    await renderer.handle({ type: "notice", version: 1, message: "This document is empty." });

    assert.deepStrictEqual(banner.calls, ["show:This document is empty."]);
    assert.deepStrictEqual(stage.shown, []);
    assert.deepStrictEqual(posted, []);
  });

  test("ignores malformed messages", async () => {
    const { renderer, stage, banner, posted } = setup();
    for (const message of [null, "render", { type: "render", format: "text", data: "<a/>" }, { type: "update" }]) {
      await renderer.handle(message);
    }
    assert.deepStrictEqual([stage.shown, banner.calls, posted], [[], [], []]);
  });
});
