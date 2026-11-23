import * as assert from "assert";
import { english, UI_STRINGS } from "../../shared/uiStrings";

suite("uiStrings", () => {
  test("english returns the source string", () => {
    assert.strictEqual(english("emptyDocument"), "This document is empty.");
  });

  test("english fills numbered placeholders", () => {
    assert.strictEqual(english("previewTitle", "hello.musicxml"), "Preview hello.musicxml");
  });

  test("english leaves placeholders without an argument as they are", () => {
    assert.strictEqual(english("previewTitle"), "Preview {0}");
  });

  test("english inserts arguments literally", () => {
    // `$&` is special in String.replace replacement strings; it must not be expanded.
    assert.strictEqual(english("previewTitle", "$&.xml"), "Preview $&.xml");
  });

  test("source strings match the spec copy", () => {
    assert.deepStrictEqual(UI_STRINGS, {
      notScore: "The active file is not a MusicXML score.",
      previewTitle: "Preview {0}",
      emptyDocument: "This document is empty.",
      timewise: "score-timewise is not supported; convert to score-partwise.",
      readFailed: "The score file could not be read.",
      renderFailed: "The score could not be rendered.",
      notXml: "The document is not XML.",
    });
  });
});
