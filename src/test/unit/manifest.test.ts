// Release invariants for the Marketplace package: things `vsce package` or the Marketplace
// would reject, or that silently drift between package.json, CHANGELOG.md and the icon.
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

// out/test/unit -> repository root (tsc does not copy package.json into out/).
const ROOT = path.resolve(__dirname, "../../..");

interface Manifest {
  name?: string;
  publisher?: string;
  version?: string;
  icon?: string;
  categories?: string[];
  keywords?: string[];
  packageManager?: string;
  repository?: { url?: string };
  engines?: { vscode?: string };
  devDependencies?: Record<string, string>;
}

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as Manifest;
}

/** "^1.140.0" / "~1.140.0" / "1.140.0" -> "1.140.0". */
function minimumVersion(range: string | undefined): string | undefined {
  return range?.match(/\d+\.\d+\.\d+/)?.[0];
}

/** Width and height from a PNG's IHDR chunk, or undefined if `bytes` is not a PNG. */
function pngSize(bytes: Buffer): { width: number; height: number } | undefined {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    return undefined;
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") {
    return undefined;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

suite("package manifest", () => {
  const manifest = readManifest();

  test("has a Marketplace identity", () => {
    assert.strictEqual(manifest.name, "musicxml-preview");
    assert.ok(manifest.publisher, "publisher is required");
    assert.match(manifest.repository?.url ?? "", /^https:\/\/github\.com\//);
  });

  test("@types/vscode is not newer than engines.vscode", () => {
    const engine = minimumVersion(manifest.engines?.vscode);
    assert.ok(engine, "engines.vscode is required");
    assert.strictEqual(minimumVersion(manifest.devDependencies?.["@types/vscode"]), engine);
  });

  test("is listed under Visualization with keywords", () => {
    assert.deepStrictEqual(manifest.categories, ["Visualization"]);
    assert.ok((manifest.keywords ?? []).length > 0, "keywords are required");
  });

  test("icon is a 128x128 PNG", () => {
    assert.strictEqual(manifest.icon, "images/icon.png");
    const iconPath = path.join(ROOT, manifest.icon);
    assert.ok(fs.existsSync(iconPath), `${manifest.icon} is missing`);
    assert.deepStrictEqual(pngSize(fs.readFileSync(iconPath)), { width: 128, height: 128 });
  });

  test("version matches the latest CHANGELOG release", () => {
    const changelog = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
    const latest = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
    assert.strictEqual(latest, manifest.version);
  });

  test("pnpm is the only package manager", () => {
    assert.match(manifest.packageManager ?? "", /^pnpm@\d+\.\d+\.\d+$/);
    assert.ok(!fs.existsSync(path.join(ROOT, "package-lock.json")), "package-lock.json must not exist");
  });
});
