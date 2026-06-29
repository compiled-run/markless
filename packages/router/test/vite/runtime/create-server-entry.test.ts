import { describe, expect, it } from 'vite-plus/test';
import { createServerEntry } from '../../../src/vite/runtime/create-server-entry.ts';

describe('server entry rendering', () => {
	it('renders matched Arcade page artifacts inside an HTML document', async () => {
		const entry = createServerEntry({
			resumeEntryPath: '/@id/virtual:arcade-router/resume-entry',
			documentModuleLoader: async () => ({
				__arcadeRouterHtmlAttributes: (props: {
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

		const response = await entry.fetch(new Request('http://arcade-router.test/'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('<html lang="en" data-path="/" data-status="200">');
		expect(html).toContain('<main>Home</main>');
	});

	it('emits resumability payloads without waking a client entry on page load', async () => {
		const entry = createServerEntry({
			resumeEntryPath: '/@id/virtual:arcade-router/resume-entry',
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: page('<main><button>Count 0</button></main>', {
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

		const response = await entry.fetch(new Request('http://arcade-router.test/'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('data-async-container');
		expect(html).toContain('<script type="arcade/state">');
		expect(html).toContain('<script type="arcade/view">');
		expect(html).toContain('<script type="arcade/route">{"file":"pages/index.tsrx"}</script>');
		expect(html.indexOf('<script type="arcade/route">')).toBeLessThan(
			html.indexOf('<script type="arcade/state">'),
		);
		expect(html).toContain('import("/@id/virtual:arcade-router/resume-entry")');
		expect(html).not.toContain('<script type="module"');
		expect(html).not.toContain('src="/@id/virtual:arcade-router/resume-entry"');
	});

	it('renders the document module shell around routed page output', async () => {
		const entry = createServerEntry({
			resumeEntryPath: '/@id/virtual:arcade-router/resume-entry',
			documentModuleLoader: async () => ({
				__arcadeRouterHtmlAttributes: (props: { readonly status: number }) => ({
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
			pageModuleLoaders: {
				'pages/docs/index.tsrx': async () => ({ default: page('<main>Docs</main>') }),
			},
			routeFileIds: ['/pages/docs/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://arcade-router.test/docs'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain(
			'<!doctype html><html lang="en" data-status="200"><head><title>/docs</title></head><body class="docs"><div data-async-container>',
		);
		expect(html).toContain('<main>Docs</main>');
		expect(html).not.toContain('<script type="module"');
		expect(html).toContain('</body></html>');
	});

	it('renders matched compiler SSR exports before a default artifact wrapper is available', async () => {
		const entry = createServerEntry({
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					arcadeRenderSsr: () => ({ html: '<main>Home</main>' }),
				}),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://arcade-router.test/'));
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

		const response = await entry.fetch(new Request('http://arcade-router.test/nope?from=test'));
		const html = await response.text();

		expect(response.status).toBe(404);
		expect(html).toContain('<main>Missing</main>');
	});

	it('returns a useful 500 body when a matched page is not an Arcade artifact', async () => {
		const entry = createServerEntry({
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({ default: {} }),
			},
			routeFileIds: ['/pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://arcade-router.test/'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain(
			'Page module must export an Arcade compiled artifact: pages/index.tsrx',
		);
	});
});

function page(
	html: string,
	payload: {
		readonly state?: unknown;
		readonly view?: unknown;
	} = {},
) {
	return {
		renderSsr() {
			return { html, ...payload };
		},
	};
}
