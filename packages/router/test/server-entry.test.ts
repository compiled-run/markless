import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
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
