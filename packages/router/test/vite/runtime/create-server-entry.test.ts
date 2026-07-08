import { describe, expect, it } from 'vite-plus/test';
import { createServerEntry } from '../../../src/vite/runtime/create-server-entry.ts';

describe('server entry rendering', () => {
	it('renders matched Markless page artifacts inside an HTML document', async () => {
		const entry = createServerEntry({
			resumeEntryPath: '/@id/virtual:markless-router/resume-entry',
			documentModuleLoader: async () => ({
				__marklessRouterHtmlAttributes: (props: {
					readonly status: number;
					readonly url: { readonly pathname: string };
				}) => ({
					lang: 'en',
					'data-path': props.url.pathname,
					'data-status': String(props.status),
				}),
			}),
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({ default: page('<main>Home</main>') }),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('<html lang="en" data-path="/" data-status="200">');
		expect(html).toContain('<main>Home</main>');
	});

	it('emits resumability payloads without waking a client entry on page load', async () => {
		const entry = createServerEntry({
			resumeEntryPath: '/@id/virtual:markless-router/resume-entry',
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: page('<main><button>Count 0</button></main>', {
						modulePreloads: [{ href: '/pages/index.tsrx?import' }],
						state: {
							version: 1,
							cells: [],
							computed: [],
						},
						view: {
							version: 1,
							locators: [
								{
									hostNodeId: 'h0',
									index: 0,
									strategy: 'dom-order',
									tagName: 'main',
								},
								{
									hostNodeId: 'h1',
									index: 1,
									strategy: 'dom-order',
									tagName: 'button',
								},
							],
							events: [
								{
									eventName: 'click',
									hostNodeId: 'h1',
									symbolIds: ['symbol:0'],
								},
							],
							domUpdates: [],
							behaviors: [],
							elementHandles: [],
							asyncBoundaries: [],
						},
					}),
				}),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('data-async-container');
		expect(html).toContain('<script type="markless/state">');
		expect(html).toContain('<script type="markless/view">');
		expect(html).toContain(
			'<script type="@markless/core/route">{"file":"pages/index.tsrx"}</script>',
		);
		expect(html.indexOf('<script type="@markless/core/route">')).toBeLessThan(
			html.indexOf('<script type="markless/state">'),
		);
		expect(html).not.toContain('/pages/index.tsrx?import');
		expect(html).toContain('import("/@id/virtual:markless-router/resume-entry")');
		expect(html).not.toContain('<script type="module"');
		expect(html).not.toContain('src="/@id/virtual:markless-router/resume-entry"');
	});

	it('serializes page props into the payload prop cell (need 14, SSR side)', async () => {
		const entry = createServerEntry({
			resumeEntryPath: '/@id/virtual:markless-router/resume-entry',
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/r/[id].tsrx': async () => ({
					default: page('<main><button>Count 0</button></main>', {
						state: { version: 1, cells: [], computed: [] },
						view: {
							version: 1,
							locators: [
								{ hostNodeId: 'h0', index: 0, strategy: 'dom-order', tagName: 'main' },
								{ hostNodeId: 'h1', index: 1, strategy: 'dom-order', tagName: 'button' },
							],
							events: [{ eventName: 'click', hostNodeId: 'h1', symbolIds: ['symbol:0'] }],
							domUpdates: [],
							behaviors: [],
							elementHandles: [],
							asyncBoundaries: [],
						},
					}),
				}),
			},
			routeFileIds: ['/pages/r/[id].tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/r/alpha'));
		const html = await response.text();
		const stateJson = html.slice(
			html.indexOf('<script type="markless/state">') + '<script type="markless/state">'.length,
		);
		const state = JSON.parse(stateJson.slice(0, stateJson.indexOf('</script>'))) as {
			readonly cells: ReadonlyArray<Record<string, unknown>>;
		};
		const propCell = state.cells.find((cell) => cell.graphNodeId === 'prop:props');

		// Symbol modules and re-running props+state computeds on resumed pages
		// read page props through the graph's prop cell; the served value must
		// be envelope-encoded, never a live directValue.
		expect(propCell).toMatchObject({ name: 'props', valueKind: 'object' });
		expect(propCell).not.toHaveProperty('directValue');
		const encodedValue = JSON.stringify(propCell?.value);
		expect(encodedValue).toContain('"alpha"');
		expect(encodedValue).toContain('/r/alpha');
	});

	it('adds no prop cell to pages without a resumability payload', async () => {
		const entry = createServerEntry({
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({ default: page('<main>Home</main>') }),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(html).not.toContain('prop:props');
		expect(html).not.toContain('<script type="markless/state">');
	});

	it('emits a lazy Link navigation bridge without waking a client entry', async () => {
		const entry = createServerEntry({
			navigationEntryPath: '/@id/virtual:markless-router/navigation-entry',
			resumeEntryPath: '/@id/virtual:markless-router/resume-entry',
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: page(
						'<main><a href="/docs/getting-started" data-markless-router-link>Docs</a></main>',
					),
				}),
			},
			routeFileIds: ['/pages/index.tsrx', '/pages/docs/[...slug].mdx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('data-markless-router-link');
		expect(html).toContain('data-markless-router-link-resumer');
		expect(html).toContain('import("/@id/virtual:markless-router/navigation-entry")');
		expect(html).not.toContain('import("/@id/virtual:markless-router/resume-entry")');
		expect(html).not.toContain('<script type="module"');
		expect(html).not.toContain('virtual:markless-router/client-entry');
		expect(html).not.toContain('__marklessRouterStartSpaNavigation');
	});

	it('bridge click handling covers only Link-attributed anchors (T106: apps use Link everywhere)', async () => {
		const entry = createServerEntry({
			navigationEntryPath: '/@id/virtual:markless-router/navigation-entry',
			resumeEntryPath: '/@id/virtual:markless-router/resume-entry',
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: page(
						'<main><a href="#/r/alpha" data-markless-router-link>Alpha</a></main>',
					),
				}),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		// Plain hash anchors are no longer special-cased by the click handler:
		// SPA navigation belongs to <Link> (data-markless-router-link) only.
		expect(html).not.toContain('hashRouteAnchor');
		expect(html).toContain('hasAttribute(linkAttr)');
		// The load-time '#/' deep-link check is about LANDING on a hash route,
		// not clicking — it stays.
		expect(html).toContain("location.hash.startsWith('#/')");
	});

	it('emits exact route modulepreloads for visible Link targets', async () => {
		const entry = createServerEntry({
			navigationEntryPath: '/build/navigation.js',
			resumeEntryPath: '/build/resume.js',
			routeModulePreloads: {
				'pages/404.tsrx': ['/build/not-found.js'],
				'pages/docs/[...slug].mdx': [
					'/build/navigation.js',
					'/build/docs.js',
					'/build/docs-symbol.js',
				],
			},
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: page(
						'<main><a href="/docs/getting-started" data-markless-router-link>Docs</a></main>',
					),
				}),
			},
			routeFileIds: ['/pages/index.tsrx', '/pages/docs/[...slug].mdx', '/pages/404.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		// Route swaps are client-side: preloading a visible Link's destination
		// page chunks avoids a navigation waterfall.
		expect(html).toContain('<link rel="modulepreload" href="/build/navigation.js"');
		expect(html).toContain('<link rel="modulepreload" href="/build/docs.js"');
		expect(html).toContain('<link rel="modulepreload" href="/build/docs-symbol.js"');
		expect(html).not.toContain('/build/not-found.js');
	});

	it('emits no document-swap machinery (client-side route swaps)', async () => {
		const entry = createServerEntry({
			navigationEntryPath: '/build/navigation.js',
			resumeEntryPath: '/build/resume.js',
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: page(
						'<main><a href="/docs/getting-started" data-markless-router-link>Docs</a></main>',
					),
				}),
			},
			routeFileIds: ['/pages/index.tsrx', '/pages/docs/[...slug].mdx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(html).not.toContain('__marklessRouterSwapPending');
		expect(html).not.toContain('markless-router-route');
		expect(html).not.toContain('before-document-swap');
	});

	it('emits current route modulepreloads in head without requiring a router Link', async () => {
		const entry = createServerEntry({
			navigationEntryPath: '/build/navigation.js',
			resumeEntryPath: '/build/resume.js',
			routeModulePreloads: {
				'pages/index.tsrx': ['/build/navigation.js', '/build/index.js'],
			},
			routeSsrModulePreloads: {
				'pages/docs/[...slug].mdx': ['/build/resume.js', '/build/docs.js'],
			},
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/docs/[...slug].mdx': async () => ({
					default: page('<main><button data-mdx-counter>MDX Count 0</button></main>'),
				}),
			},
			routeFileIds: ['/pages/index.tsrx', '/pages/docs/[...slug].mdx'],
		});

		const response = await entry.fetch(
			new Request('http://markless-router.test/docs/getting-started'),
		);
		const html = await response.text();
		const head = html.slice(0, html.indexOf('</head>'));
		const body = html.slice(html.indexOf('<body>'));

		expect(head).toContain('<link rel="modulepreload" href="/build/resume.js"');
		expect(head).toContain('<link rel="modulepreload" href="/build/docs.js"');
		expect(body).not.toContain('rel="modulepreload"');
		expect(html).not.toContain('/build/index.js');
	});

	it('renders the document module shell around routed page output', async () => {
		const entry = createServerEntry({
			resumeEntryPath: '/@id/virtual:markless-router/resume-entry',
			documentModuleLoader: async () => ({
				__marklessRouterHtmlAttributes: (props: { readonly status: number }) => ({
					lang: 'en',
					'data-status': String(props.status),
				}),
				default: {
					renderSsr(props: {
						readonly children?: unknown;
						readonly url: { pathname: string };
					}) {
						return {
							html: `<head><title>${props.url.pathname}</title></head><body class="docs">${props.children}</body>`,
						};
					},
				},
			}),
			routeSsrModulePreloads: {
				'pages/docs/index.tsrx': ['/build/docs-current.js'],
			},
			pageModuleLoaders: {
				'pages/docs/index.tsrx': async () => ({ default: page('<main>Docs</main>') }),
			},
			routeFileIds: ['/pages/docs/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/docs'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain(
			'<!doctype html><html lang="en" data-status="200"><head><title>/docs</title><link rel="modulepreload" href="/build/docs-current.js"',
		);
		expect(html).toContain('</head><body class="docs"><div data-async-container>');
		expect(html).toContain('<main>Docs</main>');
		expect(html).not.toContain('<script type="module"');
		expect(html).toContain('</body></html>');
	});

	it('inserts rendered page html through compiled document children without escaping it', async () => {
		const entry = createServerEntry({
			documentModuleLoader: async () => ({
				default: {
					renderSsr(props: { readonly children?: unknown }) {
						return {
							html: `<head><title>Compiled</title></head><body>${escapeTestHtml(String(props.children ?? ''))}</body>`,
						};
					},
				},
			}),
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({ default: page('<main>Home</main>') }),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(html).toContain('<body><div data-async-container>');
		expect(html).toContain('<main>Home</main>');
		expect(html).not.toContain('&lt;main&gt;Home&lt;/main&gt;');
	});

	it('renders matched compiler SSR exports before a default artifact wrapper is available', async () => {
		const entry = createServerEntry({
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					marklessRenderSsr: () => ({ html: '<main>Home</main>' }),
				}),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('<main>Home</main>');
		expect(html).not.toContain('Page module must default export');
	});

	it('renders status pages when routes are missing', async () => {
		const entry = createServerEntry({
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/404.tsrx': async () => ({ default: page('<main>Missing</main>') }),
			},
			routeFileIds: ['/pages/404.tsrx'],
		});

		const response = await entry.fetch(
			new Request('http://markless-router.test/nope?from=test'),
		);
		const html = await response.text();

		expect(response.status).toBe(404);
		expect(html).toContain('<main>Missing</main>');
	});

	it('returns a useful 500 body when a matched page is not an Markless artifact', async () => {
		const entry = createServerEntry({
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({ default: {} }),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain(
			'Page module must export an Markless compiled artifact: pages/index.tsrx',
		);
	});
});

function page(
	html: string,
	payload: {
		readonly modulePreloads?: readonly { readonly href: string }[];
		readonly state?: unknown;
		readonly view?: unknown;
	} = {},
) {
	return {
		modulePreloads: payload.modulePreloads,
		renderSsr() {
			return { html, ...payload };
		},
	};
}

function escapeTestHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
