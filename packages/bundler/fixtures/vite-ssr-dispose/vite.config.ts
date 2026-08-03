import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { markless } from '../../../core/src/vite.ts';
import { fixtureSsrHost } from '../vite-ssr/src/dev-server.ts';

const plugins = (() => {
	const previousWake = process.env.MARKLESS_PRERENDER_WAKE;
	process.env.MARKLESS_PRERENDER_WAKE = '1';
	try {
		return [markless(), fixtureSsrHost()];
	} finally {
		if (previousWake === undefined) delete process.env.MARKLESS_PRERENDER_WAKE;
		else process.env.MARKLESS_PRERENDER_WAKE = previousWake;
	}
})();

export default defineConfig(({ command }) => ({
	build:
		command === 'build'
			? {
					rolldownOptions: {
						input: 'index.html',
						preserveEntrySignatures: 'exports-only',
					},
				}
			: undefined,
	environments: {
		ssr: {
			build: {
				rolldownOptions: {
					input: fileURLToPath(new URL('./src/root.tsrx', import.meta.url)),
				},
			},
		},
	},
	plugins,
}));
