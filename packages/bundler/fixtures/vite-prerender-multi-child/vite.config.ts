import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';
import { markless } from '@markless/bundler/vite';

const root = import.meta.dirname;
const page = process.env.MARKLESS_FIXTURE_PAGE ?? 'App.tsrx';
const marklessPlugins = (() => {
	const previousPrerender = process.env.MARKLESS_PRERENDER;
	process.env.MARKLESS_PRERENDER = '1';
	try {
		return markless({
			packing: process.env.MARKLESS_FIXTURE_NATIVE_PACKING !== '0',
		});
	} finally {
		if (previousPrerender === undefined) delete process.env.MARKLESS_PRERENDER;
		else process.env.MARKLESS_PRERENDER = previousPrerender;
	}
})();

export default defineConfig({
	plugins: [
		marklessPlugins,
		{
			name: 'fixture:prerender-boot',
			transformIndexHtml: {
				order: 'pre',
				handler(html) {
					return html.replace('/src/main.ts', '/src/prerender.ts');
				},
			},
		},
	],
	build: {
		rolldownOptions: { input: resolve(root, 'index.html') },
	},
	environments: {
		ssr: {
			consumer: 'server',
			build: {
				rolldownOptions: {
					input: { prerender: resolve(root, 'src', page) },
				},
			},
		},
	},
});
