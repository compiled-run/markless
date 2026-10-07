import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	plugins: [markless(), router()],
	fmt: {
		useTabs: true,
		tabWidth: 4,
		printWidth: 100,
		singleQuote: true,
	},
});
