// Wires one preview webview to its score source. No vscode import: the webview and the source
// are passed in through the narrow interfaces below so this can be unit-tested.
import * as path from "path";
import { decideRender, NoticeReason } from "../domain/renderRequest";
import { HostMessage, parseWebviewMessage, ScoreContent } from "../shared/messages";
import { UiLocale, UiStringKey } from "../shared/uiStrings";
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

/** Outcome of the latest send: the webview's ack, or a notice the host showed instead. */
export type RenderResult =
  | { kind: "rendered"; version: number }
  | { kind: "error"; version: number; message: string }
  | { kind: "notice"; version: number; message: string };

const NOTICE_STRINGS: Record<NoticeReason, UiStringKey> = {
  empty: "emptyDocument",
  timewise: "timewise",
};

export interface BindPreviewOptions {
  /** Per-load random value for the CSP. */
  nonce: string;
  /** Webview URI of the bundled renderer, `out/webview.js`. */
  scriptUri: string;
  /** Language and strings for notices and the page. */
  locale: UiLocale;
  /** Called with the outcome of the latest send; results of superseded sends are dropped. */
  onResult?(result: RenderResult): void;
}

export function bindPreview(
  webview: PreviewWebview,
  load: ScoreLoader,
  { nonce, scriptUri, locale, onResult }: BindPreviewOptions,
): PreviewBinding {
  // Messages posted before the webview script runs can be lost, so the first send waits for
  // "ready". A webview reload sends "ready" again and gets the current content again.
  let ready = false;
  let disposed = false;
  // Every send gets the next version. Loads can settle out of order (disk reads) and acks can
  // arrive for superseded renders: only the latest version may post or report.
  let latest = 0;

  const { localize } = locale;
  const notify = (version: number, key: UiStringKey): void => {
    const message = localize(key);
    const notice: HostMessage = { type: "notice", version, message };
    void webview.postMessage(notice);
    onResult?.({ kind: "notice", version, message });
  };

  const send = (): void => {
    const version = ++latest;
    const current = (): boolean => !disposed && version === latest;
    load().then(
      (content) => {
        if (!current()) {
          return;
        }
        const decision = decideRender(content);
        if (decision.kind === "notice") {
          notify(version, NOTICE_STRINGS[decision.reason]);
        } else {
          void webview.postMessage(renderMessage(version, decision.content));
        }
      },
      // E.g. the file was deleted. The webview keeps its last render under the notice.
      () => {
        if (current()) {
          notify(version, "readFailed");
        }
      },
    );
  };

  const subscription = webview.onDidReceiveMessage((raw) => {
    const message = parseWebviewMessage(raw);
    if (!message) {
      return;
    }
    if (message.type === "ready") {
      ready = true;
      send();
    } else if (message.version === latest) {
      onResult?.(
        message.type === "rendered"
          ? { kind: "rendered", version: message.version }
          : { kind: "error", version: message.version, message: message.message },
      );
    }
  });
  webview.html = buildPreviewHtml({
    nonce,
    cspSource: webview.cspSource,
    scriptUri,
    lang: locale.language,
    strings: { renderFailed: localize("renderFailed"), notXml: localize("notXml") },
  });

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

/** Delay between the last edit and the re-render (docs/SPEC.md "Preview panel"). */
export const PREVIEW_DEBOUNCE_MS = 300;

/** Timer functions, injected so the debounce can be tested without waiting. */
export interface Clock {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The parts of `vscode.WebviewPanel` the manager uses, plus the renderer's webview URI. */
export interface PreviewPanel {
  readonly webview: PreviewWebview;
  readonly scriptUri: string;
  reveal(): void;
  onDidDispose(listener: () => void): Disposable;
}

export interface PreviewManagerDeps {
  createPanel(title: string): PreviewPanel;
  /** Current text of the open document, or undefined once it is closed. */
  readText(key: string): string | undefined;
  createNonce(): string;
  locale: UiLocale;
  clock: Clock;
  onResult?(key: string, result: RenderResult): void;
}

interface OpenPreview {
  panel: PreviewPanel;
  binding: PreviewBinding;
  subscription: Disposable;
  timer?: unknown;
}

/**
 * One preview panel per source document, keyed by the document URI. A panel outlives its source:
 * once the document closes no change events arrive, so the panel keeps its last render; if the
 * document is reopened, edits reach the panel again because the loader reads by key.
 */
export class PreviewManager implements Disposable {
  private readonly previews = new Map<string, OpenPreview>();

  constructor(private readonly deps: PreviewManagerDeps) {}

  /** Open the preview for a document, or reveal it if it is already open. */
  show(key: string, fileName: string): void {
    const existing = this.previews.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    const panel = this.deps.createPanel(this.deps.locale.localize("previewTitle", path.basename(fileName)));
    const load = (): Promise<ScoreContent> => {
      const text = this.deps.readText(key);
      return text === undefined
        ? Promise.reject(new Error(`Document is not open: ${key}`))
        : Promise.resolve({ format: "text", data: text });
    };
    const binding = bindPreview(panel.webview, load, {
      nonce: this.deps.createNonce(),
      scriptUri: panel.scriptUri,
      locale: this.deps.locale,
      onResult: (result) => this.deps.onResult?.(key, result),
    });
    const subscription = panel.onDidDispose(() => {
      this.close(key);
    });
    this.previews.set(key, { panel, binding, subscription });
  }

  /** Re-render the document's preview, if any, once edits pause for PREVIEW_DEBOUNCE_MS. */
  documentChanged(key: string): void {
    const preview = this.previews.get(key);
    if (!preview) {
      return;
    }
    this.deps.clock.clearTimeout(preview.timer);
    preview.timer = this.deps.clock.setTimeout(() => {
      preview.timer = undefined;
      preview.binding.refresh();
    }, PREVIEW_DEBOUNCE_MS);
  }

  /** Stop all bindings and timers. Panels themselves belong to VS Code and are left alone. */
  dispose(): void {
    for (const key of [...this.previews.keys()]) {
      this.close(key);
    }
  }

  private close(key: string): void {
    const preview = this.previews.get(key);
    if (!preview) {
      return;
    }
    this.previews.delete(key);
    this.deps.clock.clearTimeout(preview.timer);
    preview.binding.dispose();
    preview.subscription.dispose();
  }
}

function renderMessage(version: number, content: ScoreContent): HostMessage {
  if (content.format === "mxl" && Object.getPrototypeOf(content.data) !== Uint8Array.prototype) {
    // workspace.fs.readFile returns a Node Buffer; webview postMessage serialises a Buffer with
    // Buffer.toJSON() ({ type: "Buffer", data: [...] }) instead of transferring its bytes.
    return { type: "render", version, format: "mxl", data: new Uint8Array(content.data) };
  }
  return { type: "render", version, ...content };
}
