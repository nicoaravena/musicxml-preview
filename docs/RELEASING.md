# Releasing

Publishing is manual. CI builds and checks the `.vsix` but holds no Marketplace credentials.

## One-time: create the publisher

The extension ID is `nicoaravena.musicxml-preview`, read from `package.json` (`publisher` + `name`).

1. Sign in at <https://marketplace.visualstudio.com/manage> with the Microsoft account that will own
   the extension.
2. Create a publisher with ID **`nicoaravena`**. The ID must match `package.json` exactly and cannot
   be changed later. The display name is free text.
3. If the Marketplace rejects the display name "MusicXML Preview" as taken, change `displayName` in
   `package.nls.json` to "MusicXML Score Preview". Update `package.nls.ja.json` to match.

## Every release

1. On a branch, bump `version` in `package.json` and move the `[Unreleased]` notes in
   `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD` heading. The manifest test fails if the two
   disagree.
2. Merge to `main` with CI green.
3. Get the `.vsix`: download the `vsix` artifact from the CI run on `main`, or build it locally:

   ```sh
   pnpm install --frozen-lockfile
   pnpm run package:vsix          # runs vscode:prepublish (type check, lint, production bundle)
   pnpm exec vsce ls --no-dependencies   # must match .github/expected-vsix-files.txt
   ```

4. Smoke-test it in a clean profile:

   ```sh
   code --profile-temp --install-extension musicxml-preview-x.y.z.vsix
   ```

   Open `src/test/fixtures/hello.musicxml` and `hello.xml` and use the editor-title preview button.
   Open `hello.mxl` from the Explorer. Break the XML, then fix it. Repeat with the network off.
5. Upload: at <https://marketplace.visualstudio.com/manage/publishers/nicoaravena>, choose
   **New extension > Visual Studio Code** for the first release, or **... > Update** on the
   extension for later ones, and upload the `.vsix`. This needs no personal access token.
6. Tag the release commit: `git tag vx.y.z && git push origin vx.y.z`.

### Alternative: publish from the command line

`vsce publish --packagePath musicxml-preview-x.y.z.vsix` needs credentials: an Azure DevOps
personal access token with the **Marketplace (Manage)** scope (`vsce login nicoaravena`), or
Microsoft Entra ID (`--azure-credential`). Azure DevOps is retiring global PATs, so check the
current guidance at <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>
before using this path. `vsce publish` also signs the package with `@vscode/vsce-sign`, whose install
script is disabled in `pnpm-workspace.yaml`. Enable it (`'@vscode/vsce-sign': true`, then
`pnpm install`) only if you use this path.

## Third-party notices

`THIRD_PARTY_NOTICES.md` holds the licenses of the code bundled into `out/webview.js`
(OpenSheetMusicDisplay and the libraries inside its build). Review it whenever the
`opensheetmusicdisplay` version changes.
