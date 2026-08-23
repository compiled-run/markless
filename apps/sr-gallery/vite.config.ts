import { markless } from '@markless/core/vite';
import { defineConfig } from 'vite-plus';
import { PREVIEW_HOST, PREVIEW_PORT } from './preview-server.ts';

// A real screen reader has to reach this page over HTTP, and the port it reaches
// is the same one the Playwright config and the boot check use.
export default defineConfig({
	plugins: [markless()],
	preview: { host: PREVIEW_HOST, port: PREVIEW_PORT, strictPort: true },
	server: { host: PREVIEW_HOST, port: PREVIEW_PORT, strictPort: true },
});
