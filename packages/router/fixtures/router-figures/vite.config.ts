import { markless } from '@markless/core/vite';
import { router } from '@markless/core/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig(({ mode }) => ({
	plugins: [
		markless({ executionLog: mode === 'execution-measurement' ? 'auto' : undefined }),
		router(),
	],
}));
