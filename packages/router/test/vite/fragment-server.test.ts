import { expect, test } from 'vitest';
import { laterLinkBridge, servedLinkBridge, servedRouteTable } from '../support/link-bridge.ts';
import {
	createServerEntry,
	type ServerEntryOptions,
} from '../../src/vite/runtime/create-server-entry.ts';
import { FRAGMENT_REGION_END, fragmentRequestUrl } from '../../src/vite/fragment-navigation.ts';

const page = (html: string) => async () => ({
	default: { renderSsr: () => ({ html, state: { version: 1, cells: [] } }) },
});

function entry(options: Partial<ServerEntryOptions> & { readonly shell?: string } = {}) {
	const shell =
		options.shell ??
		'<html><head><meta charset="utf-8"><title>Shell</title></head><body><header class="chrome">chrome</header>__children__</body></html>';
	return createServerEntry({
		navigationEntryPath: '/navigation.js',
		fragmentEntryPath: '/fragment.js',
		routeSsrModulePreloads: {
			'pages/index.tsrx': ['/landing-index.js'],
			'pages/next.tsrx': ['/landing-next.js'],
		},
		routeModulePreloads: { 'pages/next.tsrx': ['/client-render-next.js'] },
		documentModuleLoader: async () => ({
			default: {
				renderSsr: ({ children }: { readonly children: string }) => ({
					html: shell.replace('__children__', children),
				}),
			},
		}),
		pageModuleLoaders: {
			'pages/index.tsrx': page(
				'<div data-async-container><a href="/next" data-markless-router-link>Next</a></div>',
			),
			'pages/next.tsrx': page('<div data-async-container><h1>Next</h1></div>'),
		},
		routeFileIds: ['/pages/index.tsrx', '/pages/next.tsrx'],
		...options,
	});
}

const fragmentRequest = (url: string) => new Request(fragmentRequestUrl(url));

test('a fragment fetch of a client-navigation app answers the shell head and the page region only', async () => {
	const response = await entry().fetch(fragmentRequest('https://app.test/next'));
	const html = await response.text();
	expect(html.endsWith(FRAGMENT_REGION_END)).toBe(true);
	expect(html).toContain('<title>Shell</title>');
	expect(html).toContain('<h1>Next</h1>');
	expect(html).not.toContain('class="chrome"');
});

test('a fragment fetch leaves out the import map the landing document already carries', async () => {
	const importMap =
		'<script type="importmap">{"imports":{"@markless/c/a":"/build/a.js"}}</script>';
	for (const documentNavigation of ['client', 'document'] as const) {
		const app = entry({ importMap, documentNavigation });
		const fragment = await (await app.fetch(fragmentRequest('https://app.test/next'))).text();
		const document = await (await app.fetch(new Request('https://app.test/next'))).text();
		expect(fragment).toContain('<h1>Next</h1>');
		expect(fragment).not.toContain('type="importmap"');
		expect(document).toContain(importMap);
	}
});

test('a fragment fetch of a document-navigation app answers the whole document', async () => {
	const response = await entry({ documentNavigation: 'document' }).fetch(
		fragmentRequest('https://app.test/next'),
	);
	const html = await response.text();
	expect(html.endsWith(FRAGMENT_REGION_END)).toBe(true);
	expect(html).toContain('class="chrome"');
	expect(html).toContain('<h1>Next</h1>');
});

test('a fragment request renders the page for its own URL, query kept and the fragment parameter left out', async () => {
	const pages = {
		'pages/index.tsrx': page('<div data-async-container></div>'),
		'pages/next.tsrx': async () => ({
			default: {
				renderSsr: (props: { readonly url: { readonly href: string } }) => ({
					html: `<div data-async-container><p data-href>${props.url.href}</p></div>`,
					state: { version: 1, cells: [] },
				}),
			},
		}),
	};
	const html = await (
		await entry({ pageModuleLoaders: pages }).fetch(
			fragmentRequest('https://app.test/next?tab=a%20b'),
		)
	).text();
	expect(html.endsWith(FRAGMENT_REGION_END)).toBe(true);
	expect(html).toContain('<p data-href>https://app.test/next?tab=a%20b</p>');
});

test('a document request answers the document and its body depends on the URL alone', async () => {
	const response = await entry().fetch(new Request('https://app.test/next'));
	const html = await response.text();
	expect(response.headers.get('vary')).toBeNull();
	expect(html).not.toContain(FRAGMENT_REGION_END);
	expect(html).toContain('class="chrome"');
});

test('the link bridge carries each destination landing plan and no client-render code', async () => {
	const served = entry();
	const html = await (await served.fetch(new Request('https://app.test/'))).text();
	const bridge = servedLinkBridge(html, served) ?? '';
	expect(servedRouteTable(html)).toEqual({ '/next': ['/landing-next.js'] });
	// The page bridge only listens; the config and fetch logic load on the first intent or at idle.
	expect(bridge).not.toContain('"entry":"/fragment.js"');
	expect(bridge).toContain(served.linkBridgeModules![2]!.path);
	expect(laterLinkBridge(served)).toContain('"entry":"/fragment.js"');
	expect(html).not.toContain('/client-render-next.js');
	expect(html).not.toContain('rel="modulepreload" href="/navigation.js"');
});

test('the route table is inert JSON listing each preload once, so a page evaluates no table at load', async () => {
	const linked = ['a', 'b', 'c'];
	const served = entry({
		routeSsrModulePreloads: {
			'pages/index.tsrx': ['/landing-index.js'],
			...Object.fromEntries(
				linked.map((name) => [`pages/${name}.tsrx`, ['/shared.js', `/landing-${name}.js`]]),
			),
		},
		pageModuleLoaders: {
			'pages/index.tsrx': page(
				`<div data-async-container>${linked.map((name) => `<a href="/${name}" data-markless-router-link>${name}</a>`).join('')}</div>`,
			),
			...Object.fromEntries(
				linked.map((name) => [
					`pages/${name}.tsrx`,
					page(`<div data-async-container><h1>${name}</h1></div>`),
				]),
			),
		},
		routeFileIds: ['/pages/index.tsrx', ...linked.map((name) => `/pages/${name}.tsrx`)],
	});
	const html = await (await served.fetch(new Request('https://app.test/'))).text();
	expect(servedLinkBridge(html, served)).not.toContain('/shared.js');
	const json =
		/<script type="application\/json" data-markless-router-links>([\s\S]*?)<\/script>/.exec(
			html,
		)?.[1];
	expect(json?.split('"/shared.js"')).toHaveLength(2);
	expect(servedRouteTable(html)).toEqual(
		Object.fromEntries(
			linked.map((name) => [`/${name}`, ['/shared.js', `/landing-${name}.js`]]),
		),
	);
});

test('the landing modulepreloads come right after the import map, ahead of the document head scripts a speculative parser stops at', async () => {
	const importMap =
		'<script type="importmap">{"imports":{"@markless/c/a":"/build/a.js"}}</script>';
	const served = entry({
		importMap,
		shell: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/site.css"><script>document.documentElement.dataset.theme = "dark"</script><title>Shell</title></head><body>__children__</body></html>',
	});
	const html = await (await served.fetch(new Request('https://app.test/'))).text();
	const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*>/g)];
	expect(preloads.length).toBeGreaterThan(0);
	const theme = html.indexOf('<script>document.documentElement');
	for (const preload of preloads) {
		expect(preload.index).toBeGreaterThan(html.indexOf(importMap));
		expect(preload.index).toBeLessThan(theme);
	}
	expect(html.indexOf('<title>Shell</title>')).toBeLessThan(html.indexOf('</head>'));
});

test('without the fragment entry, the fragment URL answers the page document', async () => {
	const response = await entry({ fragmentEntryPath: undefined }).fetch(
		fragmentRequest('https://app.test/next'),
	);
	const html = await response.text();
	expect(response.headers.get('vary')).toBeNull();
	expect(html).not.toContain(FRAGMENT_REGION_END);
});

test('a fragment fetch of a missing route answers the status, so the client loads the document', async () => {
	const response = await entry().fetch(fragmentRequest('https://app.test/nowhere'));
	expect(response.status).toBe(404);
});

test('plain anchors to pages get their landing plan, and the bridge names every page route', async () => {
	const served = entry({
		pageModuleLoaders: {
			'pages/index.tsrx': page(
				'<div data-async-container><a href="/next">Next</a><a href="/notes.txt">Notes</a></div>',
			),
			'pages/next.tsrx': page('<div data-async-container><h1>Next</h1></div>'),
		},
	});
	const html = await (await served.fetch(new Request('https://app.test/'))).text();
	const bridge = servedLinkBridge(html, served) ?? '';
	expect(servedRouteTable(html)).toEqual({ '/next': ['/landing-next.js'] });
	expect(bridge).not.toContain('notes.txt');
	expect(laterLinkBridge(served)).toContain('"pages":["/","/next"]');
	expect(laterLinkBridge(served)).toContain('"prefetch":true');
});

test('prefetch: false turns every speculative fetch off in the bridge', async () => {
	const served = entry({ prefetch: false });
	const html = await (await served.fetch(new Request('https://app.test/'))).text();
	expect(servedLinkBridge(html, served)).toBeDefined();
	expect(laterLinkBridge(served)).toContain('"prefetch":false');
});

test('only a page that links a hash route loads the bridge carrying its click path', async () => {
	const served = entry({
		pageModuleLoaders: {
			'pages/index.tsrx': page('<div data-async-container><a href="/next">Next</a></div>'),
			'pages/next.tsrx': page(
				'<div data-async-container><a href="#/r/alpha" data-markless-router-link>Alpha</a></div>',
			),
		},
	});
	const plainHtml = await (await served.fetch(new Request('https://app.test/'))).text();
	const hashHtml = await (await served.fetch(new Request('https://app.test/next'))).text();
	const plain = servedLinkBridge(plainHtml, served) ?? '';
	const hash = servedLinkBridge(hashHtml, served) ?? '';
	expect(plain).not.toContain('__marklessRouterHashClickStarted');
	expect(hash).toContain('__marklessRouterHashClickStarted');
	const modulePath = (html: string) => /import b from"([^"]+)"/.exec(html)?.[1];
	expect(modulePath(plainHtml)).not.toBe(modulePath(hashHtml));
	expect(plainHtml).toContain(`rel="modulepreload" href="${modulePath(plainHtml)}"`);
	expect(hashHtml).toContain(`rel="modulepreload" href="${modulePath(hashHtml)}"`);
});

test('a destination with nothing to preload is still listed, so the idle tier fetches its page', async () => {
	const served = entry({
		routeSsrModulePreloads: {
			'pages/index.tsrx': ['/landing-index.js'],
			'pages/next.tsrx': [],
		},
	});
	const html = await (await served.fetch(new Request('https://app.test/'))).text();
	expect(servedRouteTable(html)).toEqual({ '/next': [] });
});
