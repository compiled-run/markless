import { markless } from '@markless/core/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';

// Demos are the framework lab: the localhost-gated execution log stays on in
// normal builds so build+preview prints execution lines in the console.
// MARKLESS_CONSUMER_BUILD=1 rebuilds in the consumer posture ('never') for
// shipped-size walls (owner rulings 2026-07-12).
const root = import.meta.dirname;

export function musicPlayerConfig(
	executionLog = process.env.MARKLESS_CONSUMER_BUILD ? ('never' as const) : ('auto' as const),
) {
	const prerender = process.env.MARKLESS_PRERENDER !== '0';
	if (prerender) process.env.MARKLESS_PRERENDER = '1';
	return {
		plugins: [
			...markless({ executionLog }),
			...(prerender
				? [
						{
							name: 'music-player-prerender-boot',
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

export default defineConfig(musicPlayerConfig());
