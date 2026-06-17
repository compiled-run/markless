import { defineConfig } from 'vite-plus';
import { arcade } from '@arcadejs/bundler/vite';

export default defineConfig({
	plugins: [arcade()],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
