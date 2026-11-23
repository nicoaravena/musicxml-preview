import * as assert from "assert";
import { parseHostMessage, parseWebviewMessage } from "../../shared/messages";

suite("parseWebviewMessage", () => {
  for (const message of [
    { type: "ready" },
    { type: "rendered", version: 3 },
    { type: "error", version: 3, message: "bad xml" },
  ]) {
    test(`accepts ${message.type}`, () => {
      assert.deepStrictEqual(parseWebviewMessage(message), message);
    });
  }

  for (const [label, value] of [
    ["null", null],
    ["a bare string", "ready"],
    ["rendered without a version", { type: "rendered" }],
    ["error without a message", { type: "error", version: 1 }],
    ["an unknown type", { type: "nope" }],
  ] as const) {
    test(`rejects ${label}`, () => {
      assert.strictEqual(parseWebviewMessage(value), undefined);
    });
  }
});

suite("parseHostMessage", () => {
  const bytes = new Uint8Array([0x50, 0x4b]);
  for (const message of [
    { type: "render", version: 1, format: "text", data: "<score-partwise/>" },
    { type: "render", version: 2, format: "mxl", data: bytes },
    { type: "notice", version: 3, message: "This document is empty." },
  ]) {
    test(`accepts ${message.type} ${"format" in message ? message.format : ""}`, () => {
      assert.deepStrictEqual(parseHostMessage(message), message);
    });
  }

  for (const [label, value] of [
    ["text render whose data is not a string", { type: "render", version: 1, format: "text", data: bytes }],
    ["mxl render whose data is not bytes", { type: "render", version: 1, format: "mxl", data: "PK" }],
    ["render without a version", { type: "render", format: "text", data: "<a/>" }],
    ["notice without a version", { type: "notice", message: "x" }],
    ["the old update message", { type: "update", format: "text", data: "<a/>" }],
  ] as const) {
    test(`rejects ${label}`, () => {
      assert.strictEqual(parseHostMessage(value), undefined);
    });
  }
});
