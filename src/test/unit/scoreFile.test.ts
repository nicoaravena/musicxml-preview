import * as assert from "assert";
import { classifyScoreFile } from "../../domain/scoreFile";

const PARTWISE = '<score-partwise version="4.0"><part-list/></score-partwise>';
const TIMEWISE = '<score-timewise version="4.0"><part-list/></score-timewise>';
const FULL_PROLOG =
  "\uFEFF" +
  '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
  "<!-- exported by some tool -->\n" +
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"\n' +
  '  "http://www.musicxml.org/dtds/partwise.dtd">\n';

suite("classifyScoreFile", () => {
  suite(".musicxml", () => {
    test("is text with its root", () => {
      assert.deepStrictEqual(classifyScoreFile("song.musicxml", PARTWISE), {
        kind: "text",
        root: "score-partwise",
      });
    });

    test("extension is case-insensitive", () => {
      assert.deepStrictEqual(classifyScoreFile("SONG.MUSICXML", PARTWISE), {
        kind: "text",
        root: "score-partwise",
      });
    });

    test("is text even when empty (no root)", () => {
      assert.deepStrictEqual(classifyScoreFile("song.musicxml", ""), { kind: "text" });
    });
  });

  suite(".mxl", () => {
    test("is mxl regardless of head", () => {
      assert.deepStrictEqual(classifyScoreFile("song.mxl", "PK\u0003\u0004..."), { kind: "mxl" });
    });

    test("extension is case-insensitive", () => {
      assert.deepStrictEqual(classifyScoreFile("/a/b/SONG.MXL", ""), { kind: "mxl" });
    });
  });

  suite(".xml", () => {
    test("partwise after BOM, declaration, comment and DOCTYPE is text", () => {
      assert.deepStrictEqual(classifyScoreFile("song.xml", FULL_PROLOG + PARTWISE), {
        kind: "text",
        root: "score-partwise",
      });
    });

    test("timewise is text with timewise root", () => {
      assert.deepStrictEqual(classifyScoreFile("song.xml", TIMEWISE), {
        kind: "text",
        root: "score-timewise",
      });
    });

    test("DOCTYPE with an internal subset is skipped", () => {
      const head =
        '<!DOCTYPE score-partwise [\n  <!ENTITY composer "Someone">\n  <!ELEMENT x (#PCDATA)>\n]>\n' +
        PARTWISE;
      assert.deepStrictEqual(classifyScoreFile("song.xml", head), {
        kind: "text",
        root: "score-partwise",
      });
    });

    test("other root is not a score", () => {
      assert.deepStrictEqual(classifyScoreFile("pom.xml", '<?xml version="1.0"?>\n<project/>'), {
        kind: "not-score",
      });
    });

    test("empty file is not a score", () => {
      assert.deepStrictEqual(classifyScoreFile("empty.xml", ""), { kind: "not-score" });
    });

    test("score name inside a comment does not count", () => {
      const head = "<!-- <score-partwise> -->\n<foo/>";
      assert.deepStrictEqual(classifyScoreFile("x.xml", head), { kind: "not-score" });
    });

    test("root name must match exactly", () => {
      assert.deepStrictEqual(classifyScoreFile("x.xml", "<score-partwise-x/>"), {
        kind: "not-score",
      });
    });

    test("self-closing root matches", () => {
      assert.deepStrictEqual(classifyScoreFile("x.xml", "<score-partwise/>"), {
        kind: "text",
        root: "score-partwise",
      });
    });

    test("unterminated comment is not a score and does not throw", () => {
      assert.deepStrictEqual(classifyScoreFile("x.xml", "<!-- never closed <score-partwise>"), {
        kind: "not-score",
      });
    });

    test("head truncated inside the prolog is not a score", () => {
      assert.deepStrictEqual(classifyScoreFile("x.xml", '<?xml version="1.0"'), {
        kind: "not-score",
      });
    });
  });

  suite("other files", () => {
    test(".txt is not a score", () => {
      assert.deepStrictEqual(classifyScoreFile("notes.txt", PARTWISE), { kind: "not-score" });
    });

    test("no extension is not a score", () => {
      assert.deepStrictEqual(classifyScoreFile("Makefile", PARTWISE), { kind: "not-score" });
    });

    test("dots in directory names are ignored", () => {
      assert.deepStrictEqual(classifyScoreFile("/scores/a.musicxml/readme", PARTWISE), {
        kind: "not-score",
      });
      assert.deepStrictEqual(classifyScoreFile("C:\\scores\\a.mxl\\readme", PARTWISE), {
        kind: "not-score",
      });
    });
  });
});
