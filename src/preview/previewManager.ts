// Wires one preview webview to its source document. No vscode import: the webview and the
// document are passed in through the narrow interfaces below so this can be unit-tested.
import { buildPreviewHtml } from "./webviewHtml";

export interface Disposable {
  dispose(): void;
}

/** The parts of `vscode.Webview` the preview uses. */
export interface PreviewWebview {
  html: string;
  readonly cspSource: string;
  postMessage(message: unknown): Thenable<boolean>;
  onDidReceiveMessage(listener: (message: unknown) => void): Disposable;
}

/** The parts of `vscode.TextDocument` the preview uses. */
export interface PreviewSource {
  getText(): string;
}

export interface PreviewBinding extends Disposable {
  /** Send the source's current text to the webview. */
  refresh(): void;
}

export function bindPreview(
  webview: PreviewWebview,
  source: PreviewSource,
  nonce: string,
): PreviewBinding {
  // Messages posted before the webview script runs can be lost, so the first send waits for
  // "ready". A webview reload sends "ready" again and gets the current text again.
  let ready = false;
  const send = (): void => {
    void webview.postMessage({ type: "update", content: source.getText() });
  };

  const subscription = webview.onDidReceiveMessage((message) => {
    if (isReadyMessage(message)) {
      ready = true;
      send();
    }
  });
  webview.html = buildPreviewHtml({ nonce, cspSource: webview.cspSource });

  return {
    refresh(): void {
      if (ready) {
        send();
      }
    },
    dispose(): void {
      subscription.dispose();
    },
  };
}

function isReadyMessage(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "ready"
  );
}
