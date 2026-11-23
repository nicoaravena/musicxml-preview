// Preview webview HTML (docs/SPEC.md "Security (webview)"). Pure: no vscode, no node APIs.
//
// Document content is never part of this HTML: the webview posts { type: "ready" } and the
// host answers via postMessage. The only script is the bundled renderer (out/webview.js, OSMD
// included), so nothing is fetched from the network; the CSP only runs scripts carrying the
// nonce, so even markup that slipped into the page could not execute.
//
// The page does carry extension-owned text: the UI language and the strings the renderer shows
// on its own (it has no vscode.l10n). Both are attribute-escaped.
import { WebviewStrings } from "../shared/uiStrings";

export interface PreviewHtmlOptions {
  /** Per-load random value; only scripts carrying it may run. */
  nonce: string;
  /** `webview.cspSource` of the panel the HTML is for. */
  cspSource: string;
  /** Webview URI of the bundled renderer, `out/webview.js`. */
  scriptUri: string;
  /** UI language for `<html lang>`, e.g. `vscode.env.language`. */
  lang: string;
  /** Localised strings for the renderer, read back by src/webview/main.ts. */
  strings: WebviewStrings;
}

export function buildPreviewHtml({ nonce, cspSource, scriptUri, lang, strings }: PreviewHtmlOptions): string {
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `img-src ${cspSource} data: blob:`,
    `font-src ${cspSource}`,
  ].join("; ");

  // Two .page containers: the renderer draws into the hidden one and swaps on success, so a
  // failed render never disturbs the score on screen (src/webview/main.ts).
  return /*html*/ `<!DOCTYPE html>
<html lang="${escapeAttribute(lang)}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <style>
    body {
      margin: 0;
      padding: 0;
    }
    #banner {
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 6px 10px;
      color: var(--vscode-foreground);
      background: var(--vscode-inputValidation-errorBackground);
      border-bottom: 1px solid var(--vscode-inputValidation-errorBorder);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      white-space: pre-wrap;
    }
    #paper {
      position: relative;
      min-height: 100vh;
      background: #ffffff;
      color: #000000;
    }
    /* Laid out at full width (what OSMD measures) but taking no scroll space. */
    .page.back {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 0;
      overflow: hidden;
      visibility: hidden;
    }
  </style>
</head>
<body data-strings="${escapeAttribute(JSON.stringify(strings))}">
  <div id="banner" role="alert" hidden></div>
  <div id="paper">
    <div class="page front"></div>
    <div class="page back" aria-hidden="true"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
`;
}

/** Escape text for a double-quoted HTML attribute value. */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
