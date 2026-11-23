// Webview side of the protocol (docs/SPEC.md "Renderer and messaging"). DOM-free: the score
// engine and the banner are passed in, so this runs under unit tests in Node; `main.ts` wires
// it to OSMD and the page.
import { HostMessage, parseHostMessage, WebviewMessage } from "../shared/messages";

/** Shows a score. Resolves once visible; on rejection the previously shown score must stay visible. */
export interface ScoreStage {
  show(input: string | Blob): Promise<void>;
}

/** The error/notice strip above the score. */
export interface Banner {
  show(message: string): void;
  clear(): void;
}

export interface RendererDeps {
  stage: ScoreStage;
  banner: Banner;
  post(message: WebviewMessage): void;
}

export interface Renderer {
  /** Tell the host the webview is listening. Call after wiring `handle`. */
  start(): void;
  /** Handle one message from the host. Resolves when any render it started has settled. */
  handle(message: unknown): Promise<void>;
}

/** Shown when a render fails without a usable message. */
export const RENDER_FAILED_MESSAGE = "The score could not be rendered.";

/** Shown for text that is not XML at all (OSMD would request it as a URL). */
export const NOT_XML_MESSAGE = "The document is not XML.";

type RenderMessage = Extract<HostMessage, { type: "render" }>;

export function createRenderer({ stage, banner, post }: RendererDeps): Renderer {
  // Renders run one at a time; while one is in flight only the newest request waits, so fast
  // typing never builds a backlog. `newest` is the latest version seen, render or notice:
  // a result for anything older may still be acked but must not change the banner.
  let newest = 0;
  let busy = false;
  let pending: RenderMessage | undefined;

  const renderOne = async (message: RenderMessage): Promise<void> => {
    // postMessage structured-clones the bytes into a plain ArrayBuffer (never a shared one).
    const input =
      message.format === "mxl" ? new Blob([message.data as Uint8Array<ArrayBuffer>]) : message.data;
    try {
      if (typeof input === "string" && !/^\s*</.test(input)) {
        throw new Error(NOT_XML_MESSAGE);
      }
      await stage.show(input);
      if (message.version >= newest) {
        banner.clear();
      }
      post({ type: "rendered", version: message.version });
    } catch (error) {
      const text = errorText(error);
      if (message.version >= newest) {
        banner.show(text);
      }
      post({ type: "error", version: message.version, message: text });
    }
  };

  return {
    start(): void {
      post({ type: "ready" });
    },
    async handle(raw: unknown): Promise<void> {
      const message = parseHostMessage(raw);
      if (!message) {
        return;
      }
      newest = Math.max(newest, message.version);
      if (message.type === "notice") {
        pending = undefined;
        banner.show(message.message);
        return;
      }
      if (busy) {
        pending = message;
        return;
      }
      busy = true;
      try {
        let next: RenderMessage | undefined = message;
        while (next) {
          await renderOne(next);
          next = pending;
          pending = undefined;
        }
      } finally {
        busy = false;
      }
    },
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  return RENDER_FAILED_MESSAGE;
}
