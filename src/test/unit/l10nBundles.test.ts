// Keeps the translation files in step with the source strings. This stands in for
// `@vscode/l10n-dev export`, which cannot see keys passed as `UI_STRINGS[key]`.
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { UI_STRINGS } from "../../shared/uiStrings";

// out/test/unit -> repository root (tsc does not copy package.json or l10n/ into out/).
const ROOT = path.resolve(__dirname, "../../..");

function readJson(...segments: string[]): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(ROOT, ...segments), "utf8")) as Record<string, string>;
}

function placeholders(text: string): string[] {
  return (text.match(/\{\d+\}/g) ?? []).sort();
}

/** File names in `dir` matching `pattern`; none if `dir` is missing (the first test then fails). */
function listMatching(dir: string, pattern: RegExp): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => pattern.test(name)) : [];
}

const runtimeBundles = listMatching(path.join(ROOT, "l10n"), /^bundle\.l10n\.[\w-]+\.json$/);
const nlsFiles = listMatching(ROOT, /^package\.nls\.[\w-]+\.json$/);

suite("l10n bundles", () => {
  test("a Japanese runtime bundle and manifest translation exist", () => {
    assert.ok(runtimeBundles.includes("bundle.l10n.ja.json"), `found ${runtimeBundles.join(", ")}`);
    assert.ok(nlsFiles.includes("package.nls.ja.json"), `found ${nlsFiles.join(", ")}`);
  });

  test("package.json points VS Code at l10n/", () => {
    assert.strictEqual(readJson("package.json").l10n, "./l10n");
  });

  for (const bundle of runtimeBundles) {
    test(`${bundle} translates exactly the source strings`, () => {
      assert.deepStrictEqual(
        Object.keys(readJson("l10n", bundle)).sort(),
        Object.values(UI_STRINGS).sort(),
      );
    });

    test(`${bundle} keeps every placeholder`, () => {
      for (const [source, translation] of Object.entries(readJson("l10n", bundle))) {
        assert.deepStrictEqual(placeholders(translation), placeholders(source), `for "${source}"`);
      }
    });
  }

  test("every %key% in package.json has an English string", () => {
    const manifest = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
    const used = [...manifest.matchAll(/"%([^"%]+)%"/g)].map((match) => match[1]);
    assert.ok(used.length > 0, "expected localised manifest strings");
    const english = readJson("package.nls.json");
    assert.deepStrictEqual(used.filter((key) => !(key in english)), []);
  });

  for (const nls of nlsFiles) {
    test(`${nls} translates exactly the English manifest strings`, () => {
      assert.deepStrictEqual(
        Object.keys(readJson(nls)).sort(),
        Object.keys(readJson("package.nls.json")).sort(),
      );
    });
  }
});
