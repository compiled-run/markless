import { markless } from '@markless/core/vite';
import { defineConfig } from 'vite-plus';
import { localUpdateEndpoint } from './local-update-endpoint';

const executionLog = process.env.MARKLESS_CONSUMER_BUILD ? ('never' as const) : ('auto' as const);

export default defineConfig({
	plugins: [markless({ executionLog }), localUpdateEndpoint()],
});
