// Render decision (docs/SPEC.md "Renderer and messaging"). Pure: no vscode, no node APIs.
//
// Some scores are known not to render before OSMD sees them: empty documents and
// score-timewise (OSMD only reads score-partwise). Those get a notice instead of a render.
// The decision names the reason only; the host turns it into localised text.
import { SCORE_HEAD_CHARS, scoreRootOf } from "./scoreFile";

/** A score as the renderer receives it: XML text, or the raw bytes of a compressed `.mxl`. */
export type ScoreContent =
  | { format: "text"; data: string }
  | { format: "mxl"; data: Uint8Array };

export type RenderDecision =
  | { kind: "render"; content: ScoreContent }
  | { kind: "notice"; reason: NoticeReason };

/** Why a score is not sent to the renderer. */
export type NoticeReason = "empty" | "timewise";

export function decideRender(content: ScoreContent): RenderDecision {
  if (content.format === "mxl") {
    return content.data.length === 0 ? notice("empty") : { kind: "render", content };
  }
  if (content.data.trim() === "") {
    return notice("empty");
  }
  if (scoreRootOf(content.data.slice(0, SCORE_HEAD_CHARS)) === "score-timewise") {
    return notice("timewise");
  }
  return { kind: "render", content };
}

function notice(reason: NoticeReason): RenderDecision {
  return { kind: "notice", reason };
}
