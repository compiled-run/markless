import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

// Witness-only instrumentation: the production demo config keeps the stripped
// default. The prerender-wake channel is witness-opt-in until the tier
// demolition frees its shipped-JS wall cost (runtime-demolition T004/T006).
const plugins = (() => {
	const previousWake = process.env.MARKLESS_PRERENDER_WAKE;
	process.env.MARKLESS_PRERENDER_WAKE = '1';
	try {
		return [markless({ executionLog: 'auto' }), router()];
	} finally {
		if (previousWake === undefined) delete process.env.MARKLESS_PRERENDER_WAKE;
		else process.env.MARKLESS_PRERENDER_WAKE = previousWake;
	}
})();

export default defineConfig({
	plugins,
});
