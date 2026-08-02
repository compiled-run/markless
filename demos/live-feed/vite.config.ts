import { markless } from '@markless/core/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';
import { localUpdateEndpoint } from './local-update-endpoint';

const root = import.meta.dirname;

export function liveFeedConfig(
	executionLog = process.env.MARKLESS_CONSUMER_BUILD ? ('never' as const) : ('auto' as const),
) {
	// Default stays LEGACY until wake staging (T008) shrinks settlement cost:
	// prerendered live-feed pays the full wake before its settled selector and
	// blew the 30,371 ceiling at 65,379 executed bytes (measured 2026-08-02).
	// The matrix's prerendered cells still build with MARKLESS_PRERENDER=1 via
	// the box config; flip the default back after T008 lands.
	const prerender = process.env.MARKLESS_PRERENDER === '1';
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
