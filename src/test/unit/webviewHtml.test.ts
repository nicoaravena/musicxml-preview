import * as assert from "assert";
import { buildPreviewHtml } from "../../preview/webviewHtml";

const NONCE = "test-nonce-123";
const CSP_SOURCE = "https://example.vscode-cdn.net";
const SCRIPT_URI = `${CSP_SOURCE}/out/webview.js`;
const OPTIONS = { nonce: NONCE, cspSource: CSP_SOURCE, scriptUri: SCRIPT_URI };

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
    const csp = cspOf(buildPreviewHtml(OPTIONS));
    assert.strictEqual(csp.get("default-src"), "'none'");
  });

  test("only lets scripts carrying the nonce run", () => {
    const csp = cspOf(buildPreviewHtml(OPTIONS));
    assert.strictEqual(csp.get("script-src"), `'nonce-${NONCE}'`);
  });

  test("puts the nonce on every script tag", () => {
    const html = buildPreviewHtml(OPTIONS);
    const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
    assert.ok(scriptTags.length > 0, "expected at least one script tag");
    for (const tag of scriptTags) {
      assert.ok(tag.includes(`nonce="${NONCE}"`), `script tag without nonce: ${tag}`);
    }
  });

  test("loads only the bundled renderer script", () => {
    const html = buildPreviewHtml(OPTIONS);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.strictEqual(scripts.length, 1, "expected exactly one script");
    const [, attributes, body] = scripts[0];
    assert.ok(attributes.includes(`src="${SCRIPT_URI}"`), `unexpected script: ${attributes}`);
    assert.ok(attributes.includes(`nonce="${NONCE}"`));
    assert.strictEqual(body.trim(), "", "expected no inline script");
  });

  test("makes no network references", () => {
    const html = buildPreviewHtml(OPTIONS).split(SCRIPT_URI).join("").split(CSP_SOURCE).join("");
    assert.ok(!html.includes("://"), "found a URL other than the webview's own resources");
  });

  test("the hidden back page takes no scroll space", () => {
    // Absolute but invisible content still extends the scrollable area; only width matters to OSMD.
    const rule = /\.page\.back\s*\{([^}]*)\}/.exec(buildPreviewHtml(OPTIONS));
    assert.ok(rule, "expected a .page.back rule");
    assert.match(rule[1], /height:\s*0;/);
    assert.match(rule[1], /overflow:\s*hidden;/);
  });
});
