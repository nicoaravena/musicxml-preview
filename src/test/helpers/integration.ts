// Shared helpers for tests that run against the real extension in the VS Code test host.
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { MusicXmlPreviewApi } from "../../extension";
import { RenderResult } from "../../preview/previewManager";

// out/test/helpers -> repository root (tsc does not copy fixtures or package.json into out/).
const ROOT = path.resolve(__dirname, "../../..");
export const FIXTURES = path.join(ROOT, "src/test/fixtures");

export function fixtureUri(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(FIXTURES, name));
}

export async function openFixture(name: string): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(fixtureUri(name));
  await vscode.window.showTextDocument(document);
  return document;
}

export async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return condition();
}

/** The extension's internal test API. The ID comes from package.json, never hard-coded. */
export async function getApi(): Promise<MusicXmlPreviewApi> {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    publisher: string;
    name: string;
  };
  const extension = vscode.extensions.getExtension<MusicXmlPreviewApi>(
    `${manifest.publisher}.${manifest.name}`,
  );
  assert.ok(extension, "extension not found");
  return extension.activate();
}

/**
 * Resolve with the first result for `uri` that matches `accept`. Subscribe before triggering the
 * render so a fast result is not missed.
 */
export function nextResult(
  api: MusicXmlPreviewApi,
  uri: vscode.Uri,
  accept: (result: RenderResult) => boolean = () => true,
  timeoutMs = 10000,
): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`no matching render result for ${uri.toString()} within ${timeoutMs} ms`));
    }, timeoutMs);
    const subscription = api.onDidRender((event) => {
      if (event.uri === uri.toString() && accept(event.result)) {
        clearTimeout(timer);
        subscription.dispose();
        resolve(event.result);
      }
    });
  });
}
