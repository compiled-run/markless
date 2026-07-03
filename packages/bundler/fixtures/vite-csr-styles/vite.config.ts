import { defineConfig } from 'vite';
import { markless } from '@markless/bundler/vite';

export default defineConfig({
	plugins: [markless()],
});
