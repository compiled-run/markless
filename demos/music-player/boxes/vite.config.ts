import { defineConfig } from 'vite-plus';

// Witness-only instrumentation: the production demo config keeps the stripped default.
export default defineConfig(async () => {
	process.env.MARKLESS_PRERENDER = '1';
	const { musicPlayerConfig } = await import('../vite.config.ts');
	return musicPlayerConfig('auto');
});
