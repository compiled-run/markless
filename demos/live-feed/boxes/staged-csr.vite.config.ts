import { defineConfig } from 'vite-plus';

export default defineConfig(async () => {
	process.env.MARKLESS_PRERENDER = '0';
	process.env.MARKLESS_PRERENDER_WAKE = '1';
	const { liveFeedConfig } = await import('../vite.config.ts');
	return liveFeedConfig('auto');
});
