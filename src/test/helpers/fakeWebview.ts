import { PreviewWebview } from "../../preview/previewManager";

/** In-memory stand-in for `vscode.Webview`: records posts and lets tests play webview messages. */
export class FakeWebview implements PreviewWebview {
  html = "";
  options: unknown = undefined;
  readonly cspSource = "https://example.vscode-cdn.net";
  readonly posted: unknown[] = [];
  private listeners: ((message: unknown) => void)[] = [];

  /** Real webviews map file URIs to a webview origin; tests only need the identity. */
  asWebviewUri<T>(uri: T): T {
    return uri;
  }

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

/** Let pending promise callbacks run. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
