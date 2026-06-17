import { defineConfig } from 'vite-plus';
import { arcade } from 'arcade/vite';

export default defineConfig({
	plugins: [arcade()],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
