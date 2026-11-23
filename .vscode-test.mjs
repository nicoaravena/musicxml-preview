import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// Integration tests wait for real OSMD renders in the webview.
	mocha: { timeout: 20000 },
});
