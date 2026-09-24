import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	preview: { port: 4470, strictPort: true, host: '127.0.0.1' }
});
