import { describe, expect, test } from 'vitest';
import { createServerEntry } from '../src/vite/runtime/create-server-entry.ts';

type BridgeOptions = Pick<
	Parameters<typeof createServerEntry>[0],
	'documentNavigation' | 'prefetch'
>;

async function servedBridge(options: BridgeOptions = {}): Promise<string> {
	const entry = createServerEntry({
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
	const html = await (await entry.fetch(new Request('http://router.test/'))).text();
	const match = /<script data-markless-router-link-resumer>([\s\S]*?)<\/script>/.exec(html);
	if (!match) throw new Error('served page carries no router link bridge');
	return match[1]!;
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
