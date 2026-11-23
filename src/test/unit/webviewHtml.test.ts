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
