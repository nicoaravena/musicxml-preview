import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// CI runs the minimum supported version (engines.vscode) and stable.
	version: process.env.VSCODE_TEST_VERSION ?? 'stable',
	// Integration tests wait for real OSMD renders in the webview.
	mocha: { timeout: 20000 },
});
