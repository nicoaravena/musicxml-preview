// Host <-> webview message protocol (docs/SPEC.md "Renderer and messaging"). Pure types.
//
// Slice 3 subset: the host posts `update` with the score in its native format; the webview
// reports `ready`. Versions and rendered/error acks arrive with slice 2.

/** A score as the renderer receives it: XML text, or the raw bytes of a compressed `.mxl`. */
export type ScoreContent =
  | { format: "text"; data: string }
  | { format: "mxl"; data: Uint8Array };

export type HostMessage = { type: "update" } & ScoreContent;

export type WebviewMessage = { type: "ready" };
