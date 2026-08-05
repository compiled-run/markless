import { markless } from '@markless/core/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';
import { localUpdateEndpoint } from './local-update-endpoint';

const root = import.meta.dirname;

export function liveFeedConfig(
	executionLog = process.env.MARKLESS_CONSUMER_BUILD ? ('never' as const) : ('auto' as const),
) {
	// The ruled prerender build remains opt-in for its dedicated box and gate.
	const prerender = process.env.MARKLESS_PRERENDER === '1';
	process.env.MARKLESS_PRERENDER_WAKE = '1';
	return {
		plugins: [
			...markless({ executionLog }),
			localUpdateEndpoint(),
			...(prerender
				? [
						{
							name: 'live-feed-prerender-boot',
							transformIndexHtml: {
								order: 'pre' as const,
								handler(html: string) {
									return html.replace('/src/main.ts', '/src/prerender.ts');
								},
							},
						},
					]
				: []),
		],
		...(prerender
			? {
					build: {
						rolldownOptions: { input: resolve(root, 'index.html') },
					},
					environments: {
						ssr: {
							consumer: 'server' as const,
							build: {
								rolldownOptions: {
									input: { prerender: resolve(root, 'src/App.tsrx') },
								},
							},
						},
					},
				}
			: {}),
	};
}

export default defineConfig(liveFeedConfig());
