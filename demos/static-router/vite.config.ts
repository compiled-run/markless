import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

const executionLog = process.env.MARKLESS_CONSUMER_BUILD ? ('never' as const) : ('auto' as const);

export default defineConfig({
	plugins: [markless({ executionLog }), router()],
});
