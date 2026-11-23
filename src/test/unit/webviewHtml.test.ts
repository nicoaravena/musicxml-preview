import * as assert from "assert";
import { buildPreviewHtml } from "../../preview/webviewHtml";

const NONCE = "test-nonce-123";
const CSP_SOURCE = "https://example.vscode-cdn.net";

function cspOf(html: string): Map<string, string> {
  const match = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
  assert.ok(match, "expected a Content-Security-Policy meta tag");
  const directives = new Map<string, string>();
  for (const part of match[1].split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) {
      directives.set(name, values.join(" "));
    }
  }
  return directives;
}

/**
 * Run the page's inline renderer script against fakes and return what it handed to OSMD.
 * `deliver` simulates the host posting a message to the webview.
 */
function runRenderer(): { loaded: unknown[]; deliver(message: unknown): Promise<void> } {
  const html = buildPreviewHtml({ nonce: NONCE, cspSource: CSP_SOURCE });
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.strictEqual(inline.length, 1, "expected exactly one inline script");

  const loaded: unknown[] = [];
  let onMessage: ((event: { data: unknown }) => void) | undefined;
  const fakes = {
    acquireVsCodeApi: () => ({ postMessage: () => undefined }),
    opensheetmusicdisplay: {
      OpenSheetMusicDisplay: class {
        load(content: unknown): Promise<void> {
          loaded.push(content);
          return Promise.resolve();
        }
        render(): void {}
      },
    },
    window: {
      addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
        if (type === "message") {
          onMessage = listener;
        }
      },
    },
    document: { getElementById: () => ({ innerHTML: "" }) },
  };
  new Function(...Object.keys(fakes), inline[0][1])(...Object.values(fakes));

  return {
    loaded,
    async deliver(message) {
      assert.ok(onMessage, "renderer did not listen for messages");
      onMessage({ data: message });
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

suite("preview renderer script", () => {
  test("passes text scores to OSMD as a string", async () => {
    const renderer = runRenderer();
    await renderer.deliver({ type: "update", format: "text", data: "<score-partwise/>" });
    assert.deepStrictEqual(renderer.loaded, ["<score-partwise/>"]);
  });

  test("passes .mxl bytes to OSMD as a Blob", async () => {
    const renderer = runRenderer();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    await renderer.deliver({ type: "update", format: "mxl", data: bytes });

    assert.strictEqual(renderer.loaded.length, 1);
    const blob = renderer.loaded[0];
    assert.ok(blob instanceof Blob, "expected a Blob");
    assert.deepStrictEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  });
});

suite("buildPreviewHtml", () => {
  test("denies everything not explicitly allowed", () => {
    const csp = cspOf(buildPreviewHtml({ nonce: NONCE, cspSource: CSP_SOURCE }));
    assert.strictEqual(csp.get("default-src"), "'none'");
  });

  test("only lets scripts carrying the nonce run", () => {
    const csp = cspOf(buildPreviewHtml({ nonce: NONCE, cspSource: CSP_SOURCE }));
    assert.strictEqual(csp.get("script-src"), `'nonce-${NONCE}'`);
  });

  test("puts the nonce on every script tag", () => {
    const html = buildPreviewHtml({ nonce: NONCE, cspSource: CSP_SOURCE });
    const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
    assert.ok(scriptTags.length > 0, "expected at least one script tag");
    for (const tag of scriptTags) {
      assert.ok(tag.includes(`nonce="${NONCE}"`), `script tag without nonce: ${tag}`);
    }
  });
});
