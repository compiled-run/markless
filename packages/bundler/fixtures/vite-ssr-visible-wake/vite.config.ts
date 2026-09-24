import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { markless } from '../../../core/src/vite.ts';

// Not a workspace package, so it builds with no install: @markless/core resolves through its own exports map.
const core = new URL('../../../core/', import.meta.url);
const coreExports = JSON.parse(readFileSync(new URL('package.json', core), 'utf8'))
	.exports as Record<string, unknown>;
const coreFromSource: Plugin = {
	name: 'fixture-markless-core-source',
	enforce: 'pre',
	resolveId(id) {
		const match = /^@markless\/core(\/.*)?$/.exec(id);
		const target = match ? coreExports[`.${match[1] ?? ''}`] : undefined;
		return typeof target === 'string' ? fileURLToPath(new URL(target, core)) : undefined;
	},
};

const plugins = (() => {
	const previousWake = process.env.MARKLESS_PRERENDER_WAKE;
	process.env.MARKLESS_PRERENDER_WAKE = '1';
	try {
		return [coreFromSource, markless()];
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
		ssrRender: {
			consumer: 'server',
			build: {
				outDir: 'dist/server-render',
				rolldownOptions: {
					input: fileURLToPath(new URL('./src/server.ts', import.meta.url)),
				},
			},
		},
	},
	plugins,
}));
