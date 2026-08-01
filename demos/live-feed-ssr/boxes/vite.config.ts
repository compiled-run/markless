import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';
import { localUpdateEndpoint } from '../local-update-endpoint';

export default defineConfig({
	plugins: [markless({ executionLog: 'auto' }), localUpdateEndpoint(), router()],
});
