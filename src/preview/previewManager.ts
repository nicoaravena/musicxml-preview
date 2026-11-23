// Wires one preview webview to its score source. No vscode import: the webview and the source
// are passed in through the narrow interfaces below so this can be unit-tested.
import { HostMessage, ScoreContent } from "../shared/messages";
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

/** Reads the score's current content: an unsaved text document, or a file on disk. */
export type ScoreLoader = () => Promise<ScoreContent>;

export interface PreviewBinding extends Disposable {
  /** Load the score again and send it to the webview. */
  refresh(): void;
}

export function bindPreview(
  webview: PreviewWebview,
  load: ScoreLoader,
  nonce: string,
): PreviewBinding {
  // Messages posted before the webview script runs can be lost, so the first send waits for
  // "ready". A webview reload sends "ready" again and gets the current content again.
  let ready = false;
  let disposed = false;
  // Loads can settle out of order (disk reads); only the most recent one may post.
  let latest = 0;
  const send = (): void => {
    const sequence = ++latest;
    load().then(
      (content) => {
        if (!disposed && sequence === latest) {
          const message: HostMessage = { type: "update", ...content };
          void webview.postMessage(message);
        }
      },
      // A failed load (e.g. the file was deleted) keeps the last render on screen. Reporting it
      // needs the error banner from slice 2 (docs/SPEC.md "Renderer and messaging").
      () => undefined,
    );
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
      disposed = true;
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
