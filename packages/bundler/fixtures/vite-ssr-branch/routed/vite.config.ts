import { markless } from '@markless/core/vite';
import { router } from '@markless/core/router/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		markless({
			experimentalNativePacking: true,
			...(process.env.MARKLESS_FIXTURE_PACK_PLANNER === 'closures'
				? { experimentalPackPlanner: 'closures' as const }
				: {}),
		}),
		router({ linkPreloading: 'intent' }),
	],
});
