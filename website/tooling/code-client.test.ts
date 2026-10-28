import { expect, it } from 'vitest';
import { CODE_PREFETCH_FILE, type CodePrefetchManifest } from '../components/docs/code/prefetch.ts';
import { CODE_FRAME_FILE, codeClient, codeFrameHtml, dropSitePreloads } from './code-client.ts';

it('keeps the frame its own preloads and drops the site-wide list the bundler injects', () => {
	const html = codeFrameHtml('/build/frame.js', ['/build/runtime.js']);
	const injected = html.replace(
		'</head>',
		'<link rel=modulepreload href=/build/a.js crossorigin fetchpriority=high><link rel=modulepreload href=/build/b.js crossorigin></head>',
	);
	const kept = dropSitePreloads(injected);
	expect(kept).toContain('<link rel="modulepreload" href="/build/runtime.js">');
	expect(kept).toContain('<script type="module" src="/build/frame.js"></script>');
	expect(kept).not.toContain('/build/a.js');
	expect(kept).not.toContain('/build/b.js');
	expect(kept).toContain('<body class="code-stage" data-code-frame>');
});

it('answers the prefetch list in dev with the entries the dev server serves', async () => {
	const plugin = codeClient().find((one) => one.name === 'compiled-website:code-frame')!;
	(plugin.configResolved as (config: { base: string }) => void)({ base: '/' });
	const handlers: ((req: { url: string }, res: unknown, next: () => void) => void)[] = [];
	(plugin.configureServer as (server: unknown) => void)({
		middlewares: { use: (handler: (typeof handlers)[number]) => handlers.push(handler) },
	});
	const headers = new Map<string, string>();
	let body = '';
	const res = { setHeader: (name: string, value: string) => headers.set(name, value), end: (text: string) => (body = text) };
	let passed = false;
	for (const handler of handlers) handler({ url: `/${CODE_PREFETCH_FILE}` }, res, () => (passed = true));
	expect(body).not.toBe('');
	expect(headers.get('content-type')).toMatch(/^application\/json/);
	const manifest = JSON.parse(body) as CodePrefetchManifest;
	expect(manifest.session).toEqual([expect.stringMatching(/^\/@fs\/.*\/components\/docs\/code\/session\.ts$/)]);
	expect(manifest.live).toEqual([expect.stringMatching(/^\/@fs\/.*\/components\/docs\/playground\/live\.ts$/)]);
	expect(manifest.cache).toEqual([`/${CODE_FRAME_FILE}`]);
	expect(manifest.blocks).toEqual({});
	expect(passed).toBe(false);
});
