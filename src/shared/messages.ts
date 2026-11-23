// Host <-> webview message protocol (docs/SPEC.md "Renderer and messaging").
//
// The host posts `render` (a score to draw) or `notice` (a problem found host-side, shown in
// the banner without calling OSMD). The webview reports `ready` once it listens, then acks each
// render with `rendered` or `error`. Versions let both sides drop results of superseded renders.
// Parsers validate what crosses the boundary; both sides treat anything else as noise.
import { ScoreContent } from "../domain/renderRequest";

export type { ScoreContent };

export type HostMessage =
  | ({ type: "render"; version: number } & ScoreContent)
  | { type: "notice"; version: number; message: string };

export type WebviewMessage =
  | { type: "ready" }
  | { type: "rendered"; version: number }
  | { type: "error"; version: number; message: string };

export function parseWebviewMessage(value: unknown): WebviewMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  switch (value.type) {
    case "ready":
      return { type: "ready" };
    case "rendered":
      return isVersion(value.version) ? { type: "rendered", version: value.version } : undefined;
    case "error":
      return isVersion(value.version) && typeof value.message === "string"
        ? { type: "error", version: value.version, message: value.message }
        : undefined;
    default:
      return undefined;
  }
}

export function parseHostMessage(value: unknown): HostMessage | undefined {
  if (!isRecord(value) || !isVersion(value.version)) {
    return undefined;
  }
  const version = value.version;
  if (value.type === "notice") {
    return typeof value.message === "string"
      ? { type: "notice", version, message: value.message }
      : undefined;
  }
  if (value.type === "render") {
    if (value.format === "text" && typeof value.data === "string") {
      return { type: "render", version, format: "text", data: value.data };
    }
    if (value.format === "mxl" && value.data instanceof Uint8Array) {
      return { type: "render", version, format: "mxl", data: value.data };
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}
