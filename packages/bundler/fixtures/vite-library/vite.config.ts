import { defineConfig } from 'vite';
import { arcade } from 'arcade/vite';

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
