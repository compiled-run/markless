import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	// Demos are the framework lab: keep the localhost-gated execution log in
	// preview builds (production consumer apps default to 'never').
	plugins: [markless({ executionLog: 'auto' }), router()],
});
