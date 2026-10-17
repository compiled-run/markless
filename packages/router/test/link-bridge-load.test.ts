import { describe, expect, test } from 'vitest';
import { createServerEntry } from '../src/vite/runtime/create-server-entry.ts';
import { servedLinkBridge } from './support/link-bridge.ts';

type BridgeOptions = Pick<
	Parameters<typeof createServerEntry>[0],
	'documentNavigation' | 'prefetch' | 'dev'
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
	const bridge = await servedLinkBridge(html, entry);
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
		const stub = /<script type="module" data-markless-router-link-resumer>import b from"([^"]+)";b\(/.exec(html);
		expect(stub?.[1]).toMatch(/^\/_markless\/links\.[0-9a-z]+\.js$/);
		expect(html).toContain(`<link rel="modulepreload" href="${stub![1]}"`);
		expect(html).not.toContain('<script data-markless-router-link-resumer>');
		const module = await entry.fetch(new Request(`http://router.test${stub![1]}`));
		expect(module.headers.get('content-type')).toBe('text/javascript;charset=utf-8');
		expect(module.headers.get('cache-control')).toContain('immutable');
		expect(await module.text()).toMatch(/^export default\(r,p,q\)=>/);

		const dev = bridgeEntry({ dev: true });
		const devHtml = await (await dev.fetch(new Request('http://router.test/'))).text();
		expect(devHtml).toContain('<script data-markless-router-link-resumer>');
		expect(devHtml).not.toContain('/_markless/links.');
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
