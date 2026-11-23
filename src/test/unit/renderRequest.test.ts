import * as assert from "assert";
import {
  decideRender,
  EMPTY_DOCUMENT_MESSAGE,
  ScoreContent,
  TIMEWISE_MESSAGE,
} from "../../domain/renderRequest";

const PARTWISE = '<?xml version="1.0"?>\n<score-partwise version="4.0"><part-list/></score-partwise>';
const TIMEWISE = '<?xml version="1.0"?>\n<score-timewise version="4.0"><part-list/></score-timewise>';

suite("decideRender", () => {
  test("an empty text document gets the empty notice", () => {
    assert.deepStrictEqual(decideRender({ format: "text", data: "" }), {
      kind: "notice",
      message: EMPTY_DOCUMENT_MESSAGE,
    });
  });

  test("a whitespace-only text document gets the empty notice", () => {
    assert.deepStrictEqual(decideRender({ format: "text", data: "  \n\t" }), {
      kind: "notice",
      message: EMPTY_DOCUMENT_MESSAGE,
    });
  });

  test("a score-timewise document gets the timewise notice", () => {
    assert.deepStrictEqual(decideRender({ format: "text", data: TIMEWISE }), {
      kind: "notice",
      message: TIMEWISE_MESSAGE,
    });
  });

  test("a score-partwise document is rendered as is", () => {
    const content: ScoreContent = { format: "text", data: PARTWISE };
    const decision = decideRender(content);
    assert.strictEqual(decision.kind, "render");
    assert.strictEqual(decision.kind === "render" && decision.content, content);
  });

  test("text without a recognisable root is rendered so OSMD reports the error", () => {
    assert.deepStrictEqual(decideRender({ format: "text", data: "<oops" }), {
      kind: "render",
      content: { format: "text", data: "<oops" },
    });
  });

  test("a zero-byte .mxl gets the empty notice", () => {
    assert.deepStrictEqual(decideRender({ format: "mxl", data: new Uint8Array(0) }), {
      kind: "notice",
      message: EMPTY_DOCUMENT_MESSAGE,
    });
  });

  test(".mxl bytes are rendered", () => {
    const content: ScoreContent = { format: "mxl", data: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) };
    assert.deepStrictEqual(decideRender(content), { kind: "render", content });
  });

  test("messages match the spec copy", () => {
    assert.strictEqual(EMPTY_DOCUMENT_MESSAGE, "This document is empty.");
    assert.strictEqual(
      TIMEWISE_MESSAGE,
      "score-timewise is not supported; convert to score-partwise.",
    );
  });
});
