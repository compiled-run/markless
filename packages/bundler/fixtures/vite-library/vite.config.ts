import { defineConfig } from 'vite';
import { arcade } from '@arcade/bundler/vite';

export default defineConfig({
	plugins: [arcade()],
	build: {
		lib: {
			entry: 'src/index.ts',
			formats: ['es'],
		},
		rolldownOptions: {
			external: [/^@arcade\/arcade/],
		},
	},
});
