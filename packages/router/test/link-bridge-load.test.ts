import { describe, expect, test } from 'vitest';
import { createServerEntry } from '../src/vite/runtime/create-server-entry.ts';
import { servedLinkBridge } from './support/link-bridge.ts';

type BridgeOptions = Pick<
	Parameters<typeof createServerEntry>[0],
	'documentNavigation' | 'prefetch' | 'dev' | 'linkBridgePaths'
>;

function bridgeEntry(options: BridgeOptions = {}) {
	return createServerEntry({
		navigationEntryPath: '/build/navigation.js',
		pageModuleLoaders: {
			'pages/index.tsrx': async () => ({
				default: {
					renderSsr: async () => ({
						html: '<a data-markless-router-link href="/about">About</a>',
					}),
				},
			}),
			'pages/about.tsrx': async () => ({
				default: { renderSsr: async () => ({ html: '<p>About</p>' }) },
			}),
		},
		routeFileIds: ['pages/index.tsrx', 'pages/about.tsrx'],
		...options,
	});
}

async function servedBridge(options: BridgeOptions = {}): Promise<string> {
	const entry = bridgeEntry(options);
	const html = await (await entry.fetch(new Request('http://router.test/'))).text();
	const bridge = servedLinkBridge(html, entry);
	if (bridge === undefined) throw new Error('served page carries no router link bridge');
	return bridge;
}

// Runs the bridge against a minimal document and reports whether a Link click is taken over.
function clickTakenOver(source: string, href: string): boolean {
	let listener: ((event: unknown) => unknown) | undefined;
	const root = {};
	const document = {
		currentScript: { closest: () => root },
		addEventListener: (type: string, handler: (event: unknown) => unknown) => {
			if (type === 'click') listener = handler;
		},
	};
	const location = {
		href: 'http://router.test/',
		hash: '',
		origin: 'http://router.test',
		assign: () => {},
	};
	const loadNavigation = () => Promise.reject(new Error('no navigation runtime here'));
	new Function(
		'document',
		'location',
		'loadNavigation',
		'setTimeout',
		source.replaceAll('import(', 'loadNavigation('),
	)(document, location, loadNavigation, () => {});
	let prevented = false;
	const anchor = {
		href,
		closest: () => anchor,
		hasAttribute: (name: string) => name === 'data-markless-router-link',
		getAttribute: () => null,
	};
	void listener?.({
		button: 0,
		target: anchor,
		preventDefault: () => {
			prevented = true;
		},
	});
	return prevented;
}

describe('router link bridge', () => {
	test('a built page calls one cached bridge module it preloads, and dev keeps the bridge inline', async () => {
		const entry = bridgeEntry();
		const html = await (await entry.fetch(new Request('http://router.test/'))).text();
		const stub =
			/<script type="module" async data-markless-router-link-resumer>import b from"([^"]+)";b\(/.exec(
				html,
			);
		expect(stub?.[1]).toMatch(/^\/_markless\/links\/[0-9a-z]+\.js$/);
		expect(html).toContain(`<link rel="modulepreload" href="${stub![1]}"`);
		expect(html).not.toContain('<script data-markless-router-link-resumer>');
		const module = entry.linkBridgeModules?.find((candidate) => candidate.path === stub![1]);
		expect(module?.source).toMatch(/^export default\(r,p,q\)=>/);
		// The build writes the bridge as a static file, so the page handler never answers for it.
		expect((await entry.fetch(new Request(`http://router.test${stub![1]}`))).status).toBe(404);

		const prebuilt = bridgeEntry({
			linkBridgePaths: ['/_markless/links/a.js', '/_markless/links/b.js'],
		});
		const prebuiltHtml = await (
			await prebuilt.fetch(new Request('http://router.test/'))
		).text();
		expect(prebuiltHtml).toContain('import b from"/_markless/links/a.js"');
		expect(prebuilt.linkBridgeModules).toBeUndefined();

		const dev = bridgeEntry({ dev: true });
		const devHtml = await (await dev.fetch(new Request('http://router.test/'))).text();
		expect(devHtml).toContain('<script data-markless-router-link-resumer>');
		expect(devHtml).not.toContain('/_markless/links/');
	});

	test('a built page runs its bridge as soon as it arrives, so the page’s own module scripts never wait for its download', async () => {
		const html = await (await bridgeEntry().fetch(new Request('http://router.test/'))).text();
		const stub = /<script\b([^>]*)\bdata-markless-router-link-resumer>import b from/.exec(html);
		expect(stub?.[1]).toMatch(/\btype="module"/);
		expect(stub?.[1]).toMatch(/\basync\b/);
	});

	test('declares only what the page uses at load', async () => {
		const source = await servedBridge({ prefetch: false });
		expect(source).not.toContain('prefetchAttr');
		expect(source).not.toContain('documentLoads');
		expect(clickTakenOver(source, 'http://router.test/about')).toBe(true);
	});

	test('link intent keeps the prefetch attribute its listener reads', async () => {
		const source = await servedBridge();
		expect(source).toContain('const prefetchAttr = "data-markless-router-prefetch"');
		expect(clickTakenOver(source, 'http://router.test/about')).toBe(true);
	});

	test('document navigation leaves route Links to the browser and keeps hash routes', async () => {
		const source = await servedBridge({ documentNavigation: 'document' });
		expect(source).not.toContain('documentLoads');
		expect(clickTakenOver(source, 'http://router.test/about')).toBe(false);
		expect(clickTakenOver(source, 'http://router.test/#/about')).toBe(true);
	});
});
