import { defineConfig } from 'vite';
import { arcade } from '@arcadejs/bundler/vite';

export default defineConfig({
	plugins: [arcade()],
	build: {
		lib: {
			entry: 'src/index.ts',
			formats: ['es'],
		},
		rolldownOptions: {
			external: [/^@arcadejs\/arcade/],
		},
	},
});
