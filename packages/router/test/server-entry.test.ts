import { describe, expect, it, vi } from 'vite-plus/test';
import { createServerEntry } from '../src/vite/runtime/create-server-entry.ts';

describe('server entry with async compiled artifacts', () => {
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
