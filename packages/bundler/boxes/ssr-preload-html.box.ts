import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-ssr-preloader';
const INDEX = `${FIXTURE}/dist/index.html`;
const SSR_ROUTE = '/';
const MIN_COMPLEX_PRELOAD_COUNT = 6;

export default box(
	{
		name: 'ssr preload: preview HTML renders bundle graph modulepreloads',
		tags: ['ssr', 'build', 'preview', 'preload'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.environment(build, 'ssr');
		await expect.build.artifact(build, INDEX);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const html = await preview.request(SSR_ROUTE);
		await expect.html.contains(html, 'data-counter');
		await expect.html.contains(html, 'type="arcade/state"');
		await expect.html.contains(html, 'type="arcade/view"');
		await expect.html.contains(html, 'rel="modulepreload"');

		const hrefs = modulePreloadHrefs(html);
		receipt.note(`SSR preload HTML modulepreload hrefs: ${hrefs.join(', ')}`);
		assertPreloadLinksLookFrameworkOwned(html, hrefs);
		await preview.close();
		await receipt.capture('ssr preload preview html modulepreload links');
	},
);

function modulePreloadHrefs(html: string): readonly string[] {
	return [...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")[^>]*\bhref="([^"]+)"/g)].map(
		(match) => match[1],
	);
}

function assertPreloadLinksLookFrameworkOwned(html: string, hrefs: readonly string[]): void {
	if (/<script\b[^>]*\bsrc=/.test(html)) {
		throw new Error('Expected SSR preload HTML to keep startup JavaScript script-free.');
	}
	if (hrefs.length === 0) {
		throw new Error('Expected at least one modulepreload href from the bundle graph.');
	}
	if (hrefs.length < MIN_COMPLEX_PRELOAD_COUNT) {
		throw new Error(
			`Expected SSR preload fixture to expose a complex dependency graph with at least ${MIN_COMPLEX_PRELOAD_COUNT} modulepreloads, but saw ${hrefs.length}: ${hrefs.join(', ')}`,
		);
	}
	if (!html.includes('fetchpriority="high"')) {
		throw new Error('Expected framework-prioritized preloads to render high fetchpriority.');
	}
	const duplicates = hrefs.filter((href, index) => hrefs.indexOf(href) !== index);
	if (duplicates.length > 0) {
		throw new Error(`Expected deduped modulepreload hrefs, but saw: ${duplicates.join(', ')}`);
	}
	for (const href of hrefs) {
		if (!href.startsWith('/build/') || !href.endsWith('.js')) {
			throw new Error(`Expected framework-owned built JS preload href, got: ${href}`);
		}
	}

	const firstPreload = html.indexOf('rel="modulepreload"');
	const counter = html.indexOf('data-counter');
	if (firstPreload === -1 || counter === -1 || firstPreload > counter) {
		throw new Error('Expected modulepreload links before the resumable HTML shell.');
	}
}
