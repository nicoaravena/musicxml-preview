// Preview webview HTML (docs/SPEC.md "Security (webview)"). Pure: no vscode, no node APIs.
//
// Document content is never part of this HTML: the webview posts { type: "ready" } and the
// host answers with the text via postMessage. The CSP only runs scripts carrying the nonce, so
// even markup that slipped into the page could not execute.

export interface PreviewHtmlOptions {
  /** Per-load random value; only scripts carrying it may run. */
  nonce: string;
  /** `webview.cspSource` of the panel the HTML is for. */
  cspSource: string;
}

export function buildPreviewHtml({ nonce, cspSource }: PreviewHtmlOptions): string {
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `img-src ${cspSource} data: blob:`,
    `font-src ${cspSource}`,
  ].join("; ");

  return /*html*/ `
  <!DOCTYPE html>
  <html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@3.0.0/build/opensheetmusicdisplay.min.js"></script>
    <style>
      body {
        margin: 0;
        padding: 10px;
        overflow: auto;
		background-color: #f0f0f0;
      }
      #preview {
        width: 100%;
        height: 100vh;
      }
    </style>
  </head>
  <body>
    <div id="preview"></div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("preview", { autoResize: true });

      // OSMD unzips compressed MusicXML itself when given a Blob; text goes in as a string.
      async function renderMusicXML(format, data) {
        try {
          await osmd.load(format === "mxl" ? new Blob([data]) : data);
          osmd.render();
        } catch (error) {
          console.error("Error rendering MusicXML:", error);
          document.getElementById("preview").innerHTML = "<p>Failed to render MusicXML</p>";
        }
      }

      window.addEventListener("message", (event) => {
        if (event.data.type === "update") {
          renderMusicXML(event.data.format, event.data.data);
        }
      });

      vscode.postMessage({ type: "ready" });
    </script>
  </body>
  </html>
  `;
}
