import { defineConfig } from 'vite';
import { markless } from '@markless/bundler/vite';

export default defineConfig({
	plugins: [markless()],
	build: {
		lib: {
			entry: 'src/index.ts',
			formats: ['es'],
		},
		rolldownOptions: {
			external: [/^@markless\/core/],
		},
	},
});
