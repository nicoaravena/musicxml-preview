// Render decision (docs/SPEC.md "Renderer and messaging"). Pure: no vscode, no node APIs.
//
// Some scores are known not to render before OSMD sees them: empty documents and
// score-timewise (OSMD only reads score-partwise). Those get a notice instead of a render.
import { SCORE_HEAD_CHARS, scoreRootOf } from "./scoreFile";

/** A score as the renderer receives it: XML text, or the raw bytes of a compressed `.mxl`. */
export type ScoreContent =
  | { format: "text"; data: string }
  | { format: "mxl"; data: Uint8Array };

export type RenderDecision =
  | { kind: "render"; content: ScoreContent }
  | { kind: "notice"; message: string };

export const EMPTY_DOCUMENT_MESSAGE = "This document is empty.";
export const TIMEWISE_MESSAGE = "score-timewise is not supported; convert to score-partwise.";

export function decideRender(content: ScoreContent): RenderDecision {
  if (content.format === "mxl") {
    return content.data.length === 0 ? notice(EMPTY_DOCUMENT_MESSAGE) : { kind: "render", content };
  }
  if (content.data.trim() === "") {
    return notice(EMPTY_DOCUMENT_MESSAGE);
  }
  if (scoreRootOf(content.data.slice(0, SCORE_HEAD_CHARS)) === "score-timewise") {
    return notice(TIMEWISE_MESSAGE);
  }
  return { kind: "render", content };
}

function notice(message: string): RenderDecision {
  return { kind: "notice", message };
}
