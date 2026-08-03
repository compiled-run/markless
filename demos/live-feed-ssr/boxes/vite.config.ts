import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';
import { localUpdateEndpoint } from '../local-update-endpoint';

// The delta wake channel remains witness-only until its production wall is
// deliberately moved. Capture the flag while both plugins are constructed.
const plugins = (() => {
	const previousWake = process.env.MARKLESS_PRERENDER_WAKE;
	process.env.MARKLESS_PRERENDER_WAKE = '1';
	try {
		return [markless({ executionLog: 'auto' }), localUpdateEndpoint(), router()];
	} finally {
		if (previousWake === undefined) delete process.env.MARKLESS_PRERENDER_WAKE;
		else process.env.MARKLESS_PRERENDER_WAKE = previousWake;
	}
})();

export default defineConfig({ plugins });
