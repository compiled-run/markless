import { markless } from '@markless/core/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';
import { localUpdateEndpoint } from './local-update-endpoint';

const root = import.meta.dirname;

export function liveFeedConfig(
	executionLog = process.env.MARKLESS_CONSUMER_BUILD ? ('never' as const) : ('auto' as const),
) {
	// The prerender + settle path is this demo's shipped build (T014). The staged
	// box forces MARKLESS_PRERENDER=0 to keep measuring the wake-only lane.
	const prerender = process.env.MARKLESS_PRERENDER !== '0';
	// markless() reads the same variable to decide the prerender lane, so the
	// default has to be written back before the plugin factory runs.
	process.env.MARKLESS_PRERENDER = prerender ? '1' : '0';
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
