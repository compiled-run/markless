import { arcade } from 'arcade/vite';
import { router } from 'arcade/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	plugins: [arcade(), router()],
});
