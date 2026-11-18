import { expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CodePrefetchManifest } from '../components/docs/code/prefetch.ts';
import {
	CODE_FRAME_FILE,
	CODE_PREFETCH_FILE,
	CODE_PREFETCH_MODULE,
	codeClient,
	codeFrameHtml,
	dropSitePreloads,
} from './code-client.ts';

it('keeps the frame its own preloads and drops the site-wide list the bundler injects', () => {
	const html = codeFrameHtml(
		'/build/frame.js',
		{
			'ShantellSans-latin-variable.woff2': '/assets/shantell-1.woff2',
			'JoyElia-Regular.woff2': '/assets/joy-2.woff2',
			'JoyElia-Bold.woff2': '/assets/joy-bold-3.woff2',
		},
		['/build/runtime.js'],
	);
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
	for (const font of ['/assets/shantell-1.woff2', '/assets/joy-2.woff2', '/assets/joy-bold-3.woff2'])
		expect(kept).toContain(`url('${font}')`);
});

type Hook = { handler: (this: unknown, id: string) => string | null };

function loadManifest(consumer: 'server' | 'client', command: 'serve' | 'build', root = '/nowhere'): CodePrefetchManifest {
	const plugin = codeClient().find((one) => one.name === 'compiled-website:code-frame')!;
	(plugin.configResolved as (config: unknown) => void)({
		base: '/',
		command,
		root,
		build: { outDir: 'server' },
		environments: { client: { build: { outDir: 'public' } } },
	});
	const context = { environment: { config: { consumer, command } } };
	const id = (plugin.resolveId as unknown as Hook).handler.call(context, CODE_PREFETCH_MODULE);
	expect(id).toBe(`\0${CODE_PREFETCH_MODULE}`);
	const code = (plugin.load as unknown as Hook).handler.call(context, id!);
	expect(code).toMatch(/^export default /);
	return JSON.parse(code!.replace(/^export default /, '').replace(/;$/, '')) as CodePrefetchManifest;
}

it('gives the server render the dev prefetch list: the entries the dev server serves, no block lists', () => {
	const manifest = loadManifest('server', 'serve');
	expect(manifest.session).toEqual([expect.stringMatching(/^\/@fs\/.*\/components\/docs\/code\/session\.ts$/)]);
	expect(manifest.live).toEqual([expect.stringMatching(/^\/@fs\/.*\/components\/docs\/playground\/live\.ts$/)]);
	expect(manifest.cache).toEqual([`/${CODE_FRAME_FILE}`]);
	expect(manifest.blocks).toEqual({});
});

it('gives the browser an empty prefetch list, so no page carries the manifest twice', () => {
	expect(loadManifest('client', 'build')).toEqual({ session: [], live: [], cache: [], blocks: {} });
});

it('refuses a server build before the browser build has listed what the blocks load', () => {
	expect(() => loadManifest('server', 'build')).toThrow(/browser build/);
});

it('gives the server build the lists the browser build wrote into its output dir', () => {
	const root = mkdtempSync(join(tmpdir(), 'code-client-'));
	const listed: CodePrefetchManifest = {
		session: ['/build/session.js'],
		live: ['/build/live.js'],
		cache: ['/assets/compile-worker.js', `/${CODE_FRAME_FILE}`],
		blocks: { abc: ['/build/runtime.js'] },
	};
	mkdirSync(join(root, 'public'));
	writeFileSync(join(root, 'public', CODE_PREFETCH_FILE), JSON.stringify(listed));
	expect(loadManifest('server', 'build', root)).toEqual(listed);
});
