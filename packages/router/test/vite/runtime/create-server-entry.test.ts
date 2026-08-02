import { describe, expect, it, vi } from 'vite-plus/test';
import { MarklessCompileError, serializeMarklessDevError } from '@markless/bundler/dev-error';
import { ASYNC_BOUNDARY_ARM } from '../../../../serializer/src/index.ts';
import { marklessSsrAttachSnapshots, marklessSsrRunAsyncComputed } from '@markless/web/fns/ssr';
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

	it('places compiled and built route stylesheets in the document head', async () => {
		const entry = createServerEntry({
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: page('<main class="mk-page">Home</main>', {
						headInjections: [
							{
								tag: 'link',
								location: 'head',
								attributes: {
									rel: 'stylesheet',
									href: '/@id/virtual:markless:style:page.css?direct',
								},
							},
						],
					}),
				}),
			},
			routeFileIds: ['/pages/index.tsrx'],
			routeModulePreloads: {
				'pages/index.tsrx': ['/build/navigation.js'],
			},
			routeSsrModulePreloads: {
				'pages/index.tsrx': ['/build/resume.js'],
			},
			routeStylesheets: {
				'pages/index.tsrx': ['/assets/page.css'],
			},
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();
		const head = html.slice(0, html.indexOf('</head>'));
		const body = html.slice(html.indexOf('<body>'));

		expect(head).toContain(
			'<link rel="stylesheet" href="/@id/virtual:markless:style:page.css?direct">',
		);
		expect(head).toContain('<link rel="stylesheet" href="/assets/page.css">');
		expect(body).not.toContain('rel="stylesheet"');
	});

	it('relocates the leading storage seed into the document head', async () => {
		const entry = createServerEntry({
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: page('<main>Settings</main>', {
						storageSeeds: [
							{
								slotKey: 'pages/index.tsrx#theme-mode',
								driverKey: 'theme-mode',
								fallback: 'light',
							},
						],
					}),
				}),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const html = await (await entry.fetch(new Request('http://markless-router.test/'))).text();
		const head = html.slice(0, html.indexOf('</head>'));
		const body = html.slice(html.indexOf('<body>'));

		expect(head).toContain('Symbol.for("tsrx.storage/1")');
		expect(body).not.toContain('Symbol.for("tsrx.storage/1")');
	});

	it('rejects persisted client assets when server route discovery changed', () => {
		expect(() =>
			createServerEntry({
				documentModuleLoader: undefined,
				pageModuleLoaders: {
					'pages/index.tsrx': async () => ({ default: page('<main>Home</main>') }),
				},
				routeFileIds: ['/pages/index.tsrx'],
				routeModulePreloads: { 'pages/old.tsrx': ['/build/old.js'] },
				routeSsrModulePreloads: { 'pages/old.tsrx': ['/build/old.js'] },
				routeStylesheets: { 'pages/old.tsrx': ['/assets/old.css'] },
			}),
		).toThrow('client-asset routes are stale');
	});

	it('rejects an empty persisted manifest when server routes exist', () => {
		expect(() =>
			createServerEntry({
				documentModuleLoader: undefined,
				pageModuleLoaders: {
					'pages/index.tsrx': async () => ({ default: page('<main>Home</main>') }),
				},
				routeFileIds: ['/pages/index.tsrx'],
				routeModulePreloads: {},
				routeSsrModulePreloads: {},
				routeStylesheets: {},
			}),
		).toThrow('client-asset routes are stale');
	});

	it('keeps manual module-preload adapters compatible without a persisted style map', () => {
		expect(() =>
			createServerEntry({
				documentModuleLoader: undefined,
				pageModuleLoaders: {
					'pages/index.tsrx': async () => ({ default: page('<main>Home</main>') }),
				},
				routeFileIds: ['/pages/index.tsrx'],
				routeModulePreloads: { 'pages/index.tsrx': ['/build/page.js'] },
			}),
		).not.toThrow();
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
		expect(html).toContain(
			'data-markless-resume-module="/@id/virtual:markless-router/resume-entry"',
		);
		expect(html).toContain('import(/* @vite-ignore */ url)');
		expect(html).not.toContain('<script type="module"');
		expect(html).not.toContain('src="/@id/virtual:markless-router/resume-entry"');
	});

	it('forwards the compiled inline resumer through the routed page artifact', async () => {
		const compiledEventSource = 'globalThis.__routedCompiledResumer = true;';
		const artifact = page('<main><button>Count 0</button></main>', {
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
		});
		const entry = createServerEntry({
			resumeEntryPath: '/build/page-resume.js',
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: {
						...artifact,
						inlineResumerSources: {
							debug: false,
							executionLog: 'never',
							event: compiledEventSource,
							syncPolicy: 'globalThis.__routedCompiledSyncResumer = true;',
							graphSyncPolicyOwner: 'globalThis.__routedCompiledGraphOwner = true;',
							graphSyncPolicyConsumer:
								'globalThis.__routedCompiledGraphConsumer = true;',
						},
					},
				}),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(html).toContain(compiledEventSource);
		expect(html).not.toContain('__MARKLESS_INLINE_');
		expect(html).not.toContain('runInlineResumer');
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
								{ eventName: 'click', hostNodeId: 'h1', symbolIds: ['symbol:0'] },
							],
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
			html.indexOf('<script type="markless/state">') +
				'<script type="markless/state">'.length,
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

	it.each([
		{
			name: 'typed compiler error',
			error: new MarklessCompileError({
				version: 1,
				id: '/workspace/pages/weather.tsrx',
				kind: 'compile',
				diagnostics: [
					{
						code: 'MARKLESS_WEATHER_17',
						message: 'Forecast <script> is invalid',
						filename: '/workspace/pages/weather.tsrx',
						line: 7,
						column: 4,
					},
				],
				details: 'Forecast <script> is invalid',
			}),
			code: 'MARKLESS_WEATHER_17',
			unsafeText: 'Forecast <script> is invalid',
			escapedText: 'Forecast &lt;script&gt; is invalid',
		},
		{
			name: 'Vite-runner serialized compiler error',
			error: {
				message: 'Serialized crossing',
				pluginCode: serializeMarklessDevError({
					version: 1,
					id: '/different/root/pages/tides.tsrx',
					kind: 'compile',
					diagnostics: [
						{
							code: 'MARKLESS_TIDE_42',
							message: 'Tide & swell <unsafe>',
							filename: '/different/root/pages/tides.tsrx',
							line: 3,
							column: 9,
						},
					],
					details: 'Tide & swell <unsafe>',
				}),
			},
			code: 'MARKLESS_TIDE_42',
			unsafeText: 'Tide & swell <unsafe>',
			escapedText: 'Tide &amp; swell &lt;unsafe&gt;',
		},
	])(
		'renders the framework development document for a $name',
		async ({ error, code, unsafeText, escapedText }) => {
			const entry = createServerEntry({
				dev: true,
				documentModuleLoader: undefined,
				pageModuleLoaders: {
					'pages/index.tsrx': async () => {
						throw error;
					},
				},
				routeFileIds: ['/pages/index.tsrx'],
			});

			const response = await entry.fetch(new Request('http://markless-router.test/'));
			const html = await response.text();

			expect(response.status).toBe(500);
			expect(response.headers.get('content-type')).toBe('text/html;charset=utf-8');
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(html).toContain(code);
			expect(html).not.toContain(unsafeText);
			expect(html).toContain(escapedText);
		},
	);

	it('normalizes arbitrary runtime errors into the development error document', async () => {
		const entry = createServerEntry({
			dev: true,
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => {
					throw new Error('Wind sensor failed');
				},
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const html = await response.text();

		expect(response.status).toBe(500);
		expect(response.headers.get('content-type')).toBe('text/html;charset=utf-8');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(html).toContain('MARKLESS_DEV_RUNTIME_ERROR');
		expect(html).toContain('Wind sensor failed');
	});

	it('renders the configured production error route with status 500', async () => {
		const entry = createServerEntry({
			dev: false,
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => {
					throw new Error('primary render failed');
				},
				'pages/500.tsrx': async () => ({
					default: page('<main>Harbor unavailable</main>'),
				}),
			},
			routeFileIds: ['/pages/index.tsrx', '/pages/500.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));

		expect(response.status).toBe(500);
		expect(await response.text()).toContain('<main>Harbor unavailable</main>');
	});

	it('returns the terminal fallback when the production error route throws', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const entry = createServerEntry({
			dev: false,
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => {
					throw new Error('primary render failed');
				},
				'pages/500.tsrx': async () => {
					throw new Error('error route failed');
				},
			},
			routeFileIds: ['/pages/index.tsrx', '/pages/500.tsrx'],
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));

		expect(response.status).toBe(500);
		expect(response.headers.get('content-type')).toBe('text/plain;charset=utf-8');
		expect(await response.text()).toBe('Internal Server Error');
		expect(
			errorSpy.mock.calls.filter(
				([message]) => message === '[markless-router] error page render failed:',
			),
		).toHaveLength(1);
		errorSpy.mockRestore();
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

// A compiled-module-shaped page whose @try boundary demands a delayed async
// computed, threading the render context like emitted code does (alternate-
// shaped: a tide chart, not a dashboard).
function tidePage(
	delayMs: number,
	lifecycle?: {
		readonly onSettleStarted?: () => void;
		readonly onSettleFinished?: () => void;
		readonly onSettleCancelled?: () => void;
	},
) {
	return {
		resumeModuleUrl: '/build/tide-resume.js',
		async renderSsr(_props?: unknown, renderContext?: unknown) {
			const snapshots: unknown[] = [];
			const snapshot = (await marklessSsrRunAsyncComputed(
				snapshots as never,
				'computed:tides',
				async ({ signal }: { readonly signal: AbortSignal }) => {
					lifecycle?.onSettleStarted?.();
					await new Promise<void>((resolve, reject) => {
						const timer = setTimeout(() => {
							lifecycle?.onSettleFinished?.();
							resolve();
						}, delayMs);
						signal.addEventListener(
							'abort',
							() => {
								clearTimeout(timer);
								lifecycle?.onSettleCancelled?.();
								reject(signal.reason);
							},
							{ once: true },
						);
					});
					return { crest: 'High tide 14:02' };
				},
				renderContext,
				true,
			)) as { readonly status: string; readonly value?: { readonly crest: string } };
			const arm =
				snapshot.status === 'fulfilled'
					? `<article data-crest>${snapshot.value!.crest}</article>`
					: '<p data-surveying>Reading the buoys</p>';
			return {
				html: `<main><!--markless:async:tide:0-->${arm}<!--/markless:async:tide:0--></main>`,
				structure: { anchors: [{ kind: 'async', id: 'tide:0', html: arm }] },
				state: marklessSsrAttachSnapshots(
					{
						version: 1,
						cells: [],
						computed: [{ graphNodeId: 'computed:tides', name: 'tides', async: true }],
					} as never,
					snapshots as never,
				),
				view: {
					version: 1,
					locators: [
						{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' },
					],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						{
							id: 'tide:0',
							runnerGraphNodeId: 'computed:tides',
							initiallyServedArm:
								snapshot.status === 'fulfilled'
									? ASYNC_BOUNDARY_ARM.try
									: snapshot.status === 'rejected'
										? ASYNC_BOUNDARY_ARM.catch
										: ASYNC_BOUNDARY_ARM.pending,
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [
								{
									source: 'tides',
									graphNodeId: 'computed:tides',
									path: [],
									runnerSymbolId: 'symbol:tide-run',
								},
							],
							armRecords: {
								locators: [],
								events: [],
								behaviors: [],
								elementHandles: [],
							},
						},
					],
				},
			};
		},
	};
}

async function readChunks(response: Response): Promise<{ chunks: string[]; text: string }> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(decoder.decode(value, { stream: true }));
	}
	return { chunks, text: chunks.join('') };
}

describe('server entry streaming (default)', () => {
	const entryOptions = (render?: 'streaming' | 'blocking', delayMs = 40) => ({
		...(render ? { render } : {}),
		resumeEntryPath: '/build/tide-resume.js',
		documentModuleLoader: undefined,
		pageModuleLoaders: {
			'pages/index.tsrx': async () => ({ default: tidePage(delayMs) }),
		},
		routeFileIds: ['/pages/index.tsrx'],
	});

	it('streams by default: pending shell first, settled template appended on the SAME response', async () => {
		const entry = createServerEntry(entryOptions());
		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const { chunks, text } = await readChunks(response);

		expect(response.status).toBe(200);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
		// Shell flushed with the pending arm; settled content arrives later.
		expect(chunks[0]).toContain('data-surveying');
		expect(chunks[0]).not.toContain('High tide 14:02');
		expect(text).toContain(
			'<template m:arm="tide:0"><article data-crest>High tide 14:02</article></template>',
		);
		expect(text).toContain('<script type="markless/arm" data-boundary="tide:0">');
		expect(text).toContain(
			'<script type="markless/state-patch" data-graph-node="computed:tides">',
		);
		expect(text).toContain('__mArm("tide:0")');
		// The document closes AFTER the streamed settle.
		expect(text.indexOf('__mArm("tide:0")')).toBeLessThan(text.indexOf('</body></html>'));
	});

	it('cancels an in-flight settle without writing append or suffix bytes to a closed stream', async () => {
		let settleStarted = false;
		let settleFinished = false;
		let settleCancelled = false;
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const entry = createServerEntry({
			...entryOptions(),
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: tidePage(1_000, {
						onSettleStarted: () => {
							settleStarted = true;
						},
						onSettleFinished: () => {
							settleFinished = true;
						},
						onSettleCancelled: () => {
							settleCancelled = true;
						},
					}),
				}),
			},
		});

		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const reader = response.body!.getReader();
		const firstChunk = await reader.read();
		expect(new TextDecoder().decode(firstChunk.value)).toContain('data-surveying');
		expect(settleStarted).toBe(true);

		await reader.cancel('measurement complete');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(settleCancelled).toBe(true);
		expect(settleFinished).toBe(false);
		expect(
			errorSpy.mock.calls.some(([message, error]) =>
				`${String(message)} ${String(error)}`.includes('ERR_INVALID_STATE'),
			),
		).toBe(false);
		errorSpy.mockRestore();
	});

	it('renders inline with zero streaming artifacts when data beats the first-flush deadline', async () => {
		const entry = createServerEntry(entryOptions(undefined, 0));
		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const { text } = await readChunks(response);

		expect(text).toContain('High tide 14:02');
		expect(text).not.toContain('data-surveying');
		expect(text).not.toContain('m:arm');
		expect(text).not.toContain('state-patch');
		expect(text).not.toContain('__mArm');
	});

	it('render: "blocking" opts out — the whole document awaits the settle', async () => {
		const entry = createServerEntry(entryOptions('blocking'));
		const response = await entry.fetch(new Request('http://markless-router.test/'));
		const text = await response.text();

		expect(text).toContain('High tide 14:02');
		expect(text).not.toContain('data-surveying');
		expect(text).not.toContain('m:arm');
		expect(text).not.toContain('__mArm');
	});
});

function page(
	html: string,
	payload: {
		readonly storageSeeds?: readonly {
			readonly slotKey: string;
			readonly driverKey: string;
			readonly fallback: string;
		}[];
		readonly headInjections?: readonly {
			readonly tag: string;
			readonly location: 'head' | 'body';
			readonly attributes?: Record<string, string>;
		}[];
		readonly modulePreloads?: readonly { readonly href: string }[];
		readonly state?: unknown;
		readonly view?: unknown;
	} = {},
) {
	return {
		headInjections: payload.headInjections,
		storageSeeds: payload.storageSeeds,
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
