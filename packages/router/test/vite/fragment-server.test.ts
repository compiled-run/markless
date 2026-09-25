import { expect, test } from 'vitest';
import {
	createServerEntry,
	type ServerEntryOptions,
} from '../../src/vite/runtime/create-server-entry.ts';
import {
	FRAGMENT_REGION_END,
	FRAGMENT_REQUEST_HEADER,
} from '../../src/vite/fragment-navigation.ts';

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

const fragmentRequest = (url: string) =>
	new Request(url, { headers: { [FRAGMENT_REQUEST_HEADER]: '1' } });

test('a fragment fetch of a client-navigation app answers the shell head and the page region only', async () => {
	const response = await entry().fetch(fragmentRequest('https://app.test/next'));
	const html = await response.text();
	expect(response.headers.get('vary')).toBe(FRAGMENT_REQUEST_HEADER);
	expect(html.endsWith(FRAGMENT_REGION_END)).toBe(true);
	expect(html).toContain('<title>Shell</title>');
	expect(html).toContain('<h1>Next</h1>');
	expect(html).not.toContain('class="chrome"');
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

test('a document request is unchanged but still varies on the fragment header', async () => {
	const response = await entry().fetch(new Request('https://app.test/next'));
	const html = await response.text();
	expect(response.headers.get('vary')).toBe(FRAGMENT_REQUEST_HEADER);
	expect(html).not.toContain(FRAGMENT_REGION_END);
	expect(html).toContain('class="chrome"');
});

test('the link bridge carries each destination landing plan and no client-render code', async () => {
	const html = await (await entry().fetch(new Request('https://app.test/'))).text();
	const bridge =
		/<script data-markless-router-link-resumer>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
	expect(bridge).toContain('"/next":["/landing-next.js"]');
	expect(bridge).toContain('"entry":"/fragment.js"');
	expect(html).not.toContain('/client-render-next.js');
	expect(html).not.toContain('rel="modulepreload" href="/navigation.js"');
});

test('without the fragment entry, route changes stay client-rendered and responses do not vary', async () => {
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
	const html = await (
		await entry({
			pageModuleLoaders: {
				'pages/index.tsrx': page(
					'<div data-async-container><a href="/next">Next</a><a href="/notes.txt">Notes</a></div>',
				),
				'pages/next.tsrx': page('<div data-async-container><h1>Next</h1></div>'),
			},
		}).fetch(new Request('https://app.test/'))
	).text();
	const bridge =
		/<script data-markless-router-link-resumer>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
	expect(bridge).toContain('"/next":["/landing-next.js"]');
	expect(bridge).not.toContain('notes.txt');
	expect(bridge).toContain('"pages":["/","/next"]');
	expect(bridge).toContain('"prefetch":true');
});

test('prefetch: false turns every speculative fetch off in the bridge', async () => {
	const html = await (
		await entry({ prefetch: false }).fetch(new Request('https://app.test/'))
	).text();
	const bridge =
		/<script data-markless-router-link-resumer>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
	expect(bridge).toContain('"prefetch":false');
});
