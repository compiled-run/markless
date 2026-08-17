import { markless } from '@markless/core/vite';
import { router } from '@markless/core/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	plugins: [markless(), router()],
});
