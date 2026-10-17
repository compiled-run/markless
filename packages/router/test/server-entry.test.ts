import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { STORAGE_RENDER_CONTEXT_READER } from '../../serializer/src/storage-cookie.ts';
import { storageCookieName } from '../../serializer/src/storage-slot.ts';
import { __marklessCreateHttpContext, type HttpContext } from '../src/index.ts';
import { createServerEntry } from '../src/vite/runtime/create-server-entry.ts';

describe('server entry with async compiled artifacts', () => {
	it('passes Vite development mode from the source server entry', async () => {
		const source = await readFile(
			new URL('../src/vite/entries/server-entry.ts', import.meta.url),
			'utf8',
		);

		expect(source).toContain('dev: import.meta.env.DEV');
	});
	it('awaits async renderSsr for pages and document modules', async () => {
		// Compiled marklessRenderSsr is async since the initial-render awaiting
		// work: the server entry must await it, not interpolate a Promise.
		const entry = createServerEntry({
			// The demos set a navigation entry, which makes the server entry read
			// output.html synchronously — the exact line that throws on a Promise.
			navigationEntryPath: '/assets/nav.js',
			documentModuleLoader: async () => ({
				default: {
					renderSsr: async (props: { readonly children: string }) => ({
						html: `<html><body>${props.children}</body></html>`,
					}),
				},
			}),
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: {
						renderSsr: async () => ({ html: '<main>Hello async</main>' }),
					},
				}),
			},
			routeFileIds: ['pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://localhost/'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('<main>Hello async</main>');
		expect(html).toContain('<body>');
	});

	it('links the document stylesheets on every route ahead of the route’s own, once', async () => {
		const entry = createServerEntry({
			documentStylesheets: ['/assets/site-header.css', '/assets/document.css'],
			routeModulePreloads: { 'pages/index.tsrx': [] },
			routeSsrModulePreloads: { 'pages/index.tsrx': [] },
			routeStylesheets: {
				'pages/index.tsrx': ['/assets/document.css', '/assets/index-page.css'],
			},
			documentModuleLoader: async () => ({
				default: {
					renderSsr: async (props: { readonly children: string }) => ({
						html: `<html><head></head><body>${props.children}</body></html>`,
					}),
				},
			}),
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: { renderSsr: async () => ({ html: '<main>Styled</main>' }) },
				}),
			},
			routeFileIds: ['pages/index.tsrx'],
		});

		const html = await (await entry.fetch(new Request('http://localhost/'))).text();
		const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);

		expect(hrefs).toEqual([
			'/assets/site-header.css',
			'/assets/document.css',
			'/assets/index-page.css',
		]);
	});

	it('links the document artifact’s own head injections (dev scoped styles) ahead of the page’s', async () => {
		const link = (href: string) => ({
			tag: 'link',
			location: 'head' as const,
			attributes: { rel: 'stylesheet', href },
		});
		const entry = createServerEntry({
			documentModuleLoader: async () => ({
				default: {
					headInjections: [link('/dev/site-header.css'), link('/dev/document.css')],
					renderSsr: async (props: { readonly children: string }) => ({
						html: `<html><head></head><body>${props.children}</body></html>`,
					}),
				},
			}),
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: {
						headInjections: [link('/dev/document.css'), link('/dev/island.css')],
						renderSsr: async () => ({ html: '<main>Styled</main>' }),
					},
				}),
			},
			routeFileIds: ['pages/index.tsrx'],
		});

		const html = await (await entry.fetch(new Request('http://localhost/'))).text();
		const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);

		expect(hrefs).toEqual(['/dev/site-header.css', '/dev/document.css', '/dev/island.css']);
	});

	it('renders storage() from the request cookie and keeps that response out of shared caches', async () => {
		const storagePage = {
			default: {
				renderSsr: async (_props: unknown, context?: Record<string, unknown>) => {
					const read = context?.[STORAGE_RENDER_CONTEXT_READER] as
						| ((key: string) => string | undefined)
						| undefined;
					return {
						html: `<main>${read?.('theme') ?? 'light'}</main>`,
						state: {
							version: 2,
							cells: [],
							computed: [],
							sharedDefinitions: [],
							storage: [{ graphNodeId: 'storage:pages/index.tsrx#theme', key: 'theme' }],
						},
					};
				},
			},
		};
		const entry = (page: unknown) =>
			createServerEntry({
				documentModuleLoader: undefined,
				pageModuleLoaders: { 'pages/index.tsrx': async () => page },
				routeFileIds: ['pages/index.tsrx'],
			});
		const withCookie = await entry(storagePage).fetch(
			new Request('http://localhost/', {
				headers: { cookie: `${storageCookieName('theme')}=dark` },
			}),
		);
		const withoutCookie = await entry(storagePage).fetch(new Request('http://localhost/'));
		const storageFree = await entry({
			default: { renderSsr: async () => ({ html: '<main>plain</main>' }) },
		}).fetch(new Request('http://localhost/'));

		expect(await withCookie.text()).toContain('<main>dark</main>');
		expect(withCookie.headers.get('cache-control')).toBe('private');
		expect(withCookie.headers.get('vary')).toContain('cookie');
		expect(await withoutCookie.text()).toContain('<main>light</main>');
		expect(withoutCookie.headers.get('cache-control')).toBe('private');
		expect(storageFree.headers.get('cache-control')).toBeNull();
		expect(storageFree.headers.get('vary')).toBeNull();
	});

	it('logs render errors before serving the 500 status page', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const entry = createServerEntry({
			documentModuleLoader: undefined,
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: {
						renderSsr: async () => {
							throw new Error('boom from page render');
						},
					},
				}),
			},
			routeFileIds: ['pages/index.tsrx'],
		});

		const response = await entry.fetch(new Request('http://localhost/'));
		expect(response.status).toBe(500);
		// The bare catch previously swallowed every stack; dev must see it.
		expect(errorSpy).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ message: 'boom from page render' }),
		);
		errorSpy.mockRestore();
	});
});

type PageHttpProps = {
	readonly http: HttpContext;
	readonly params: Readonly<Record<string, string>>;
};

function pageEntry(
	render: (props: PageHttpProps) => { html: string; state?: unknown },
	render_mode?: 'blocking',
) {
	return createServerEntry({
		documentModuleLoader: undefined,
		...(render_mode ? { render: render_mode } : {}),
		pageModuleLoaders: {
			'pages/invoices/[id].tsrx': async () => ({
				default: { renderSsr: async (props: PageHttpProps) => render(props) },
			}),
		},
		routeFileIds: ['pages/invoices/[id].tsrx'],
	});
}

describe('the page http object', () => {
	it.each([['streaming'], ['blocking']] as const)(
		'a %s page answers with the status and headers it set',
		async (mode) => {
			const entry = pageEntry(
				({ http, params }) => {
					if (params.id === 'missing') {
						http.response.status = 404;
						http.response.headers.set('cache-control', 'no-store');
					}
					http.response.headers.append('set-cookie', 'seen=1; Path=/');
					http.response.headers.append('set-cookie', 'seen=1; Path=/');
					return { html: `<h1>No invoice ${params.id}</h1>` };
				},
				mode === 'blocking' ? 'blocking' : undefined,
			);

			const missing = await entry.fetch(new Request('http://localhost/invoices/missing'));
			const found = await entry.fetch(new Request('http://localhost/invoices/7'));

			expect(missing.status).toBe(404);
			expect(missing.headers.get('cache-control')).toBe('no-store');
			expect(missing.headers.get('content-type')).toBe('text/html;charset=utf-8');
			expect(missing.headers.getSetCookie()).toEqual(['seen=1; Path=/']);
			expect(await missing.text()).toContain('<h1>No invoice missing</h1>');
			expect(found.status).toBe(200);
			expect(found.headers.get('cache-control')).toBeNull();
		},
	);

	it('gives the page the request, its url, and the locals middleware set on that request', async () => {
		let seen: HttpContext | undefined;
		const entry = pageEntry(({ http }) => {
			seen = http;
			return { html: '<p>ok</p>' };
		});
		const request = new Request('http://localhost/invoices/7?tab=lines', {
			headers: { cookie: 'session=abc' },
		});
		__marklessCreateHttpContext({ req: request, context: { requestId: 'mw-7' } });

		await entry.fetch(request);

		expect(seen?.request).toBe(request);
		expect(seen?.url.search).toBe('?tab=lines');
		expect(seen?.locals).toEqual({ requestId: 'mw-7' });
	});

	it('refuses a write that changes the response once it was sent, and allows repeating it', async () => {
		let http: HttpContext | undefined;
		const entry = pageEntry((props) => {
			http = props.http;
			http.response.status = 404;
			http.response.headers.set('x-invoice', 'missing');
			return { html: '<p>gone</p>' };
		});

		const response = await entry.fetch(new Request('http://localhost/invoices/missing'));

		expect(response.status).toBe(404);
		expect(() => {
			http!.response.status = 404;
			http!.response.headers.set('x-invoice', 'missing');
		}).not.toThrow();
		expect(() => {
			http!.response.status = 500;
		}).toThrow(/^MARKLESS_ROUTER_RESPONSE_COMMITTED: /);
		expect(() => http!.response.headers.set('x-invoice', 'other')).toThrow(
			/^MARKLESS_ROUTER_RESPONSE_COMMITTED: /,
		);
		expect(() => http!.response.headers.delete('content-type')).toThrow(
			/^MARKLESS_ROUTER_RESPONSE_COMMITTED: /,
		);
		expect(response.headers.get('x-invoice')).toBe('missing');
	});
});
