import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import type { Plugin } from 'vite';
import { describe, expect, test } from 'vitest';
import { documentNavigationFor } from '../../src/vite/document-navigation.ts';
import { router } from '../../src/vite/index.ts';
import { createServerEntry } from '../../src/vite/runtime/create-server-entry.ts';

describe('document navigation detection', () => {
	const cases: ReadonlyArray<readonly [string, string | undefined, 'client' | 'document']> = [
		['no document file', undefined, 'client'],
		[
			'children-only destructuring',
			'export default function Document({ children }) @{ <html><body>{children}</body></html> }',
			'client',
		],
		[
			'renamed children binding',
			'export default function Shell({ children: body }) @{ <html><body>{body}</body></html> }',
			'client',
		],
		['no props', 'export default function Page() @{ <html><body /></html> }', 'client'],
		[
			'arrow default export by name',
			'const Frame = ({ children }) => children;\nexport default Frame;',
			'client',
		],
		[
			'reads url',
			'export default function Document({ url, children }) @{ <html><title>{url.pathname}</title><body>{children}</body></html> }',
			'document',
		],
		[
			'reads params',
			'export default function Layout({ children, params }) @{ <html><body data-id={params.id}>{children}</body></html> }',
			'document',
		],
		[
			'whole props object',
			'export default function Document(props) @{ <html><body>{props.children}</body></html> }',
			'document',
		],
		[
			'rest props',
			'export default function Document({ children, ...rest }) @{ <html><body>{children}</body></html> }',
			'document',
		],
		[
			'html attribute hook',
			'export const __marklessRouterHtmlAttributes = (props) => ({ lang: props.url.pathname });\nexport default function Document({ children }) @{ <html><body>{children}</body></html> }',
			'document',
		],
		['no default export', 'export const x = 1;', 'document'],
		['unparseable source', 'export default function (', 'document'],
	];

	for (const [name, source, expected] of cases) {
		test(name, () => {
			expect(documentNavigationFor(source, '/app/document.tsrx')).toBe(expected);
		});
	}

	test('the options module reports the document mode to the server and client entries', async () => {
		const plugins = router({ nitro: false }).flat(Infinity) as Plugin[];
		const plugin = plugins.find((item) => item.name === 'markless-router:routes')!;
		const load = typeof plugin.load === 'function' ? plugin.load : plugin.load!.handler;
		const serverSource = load.call(
			{} as never,
			'\0virtual:markless-router/server-entry',
		) as string;
		const optionsSource = await load.call({} as never, '\0virtual:markless-router/options');
		expect(serverSource).toContain('documentNavigation,');
		expect(optionsSource).toContain('export const documentNavigation = "client";');
	});
});

describe('Link clicks under a URL-dependent document', () => {
	async function serve(documentNavigation: 'client' | 'document') {
		const fetched: string[] = [];
		const entry = createServerEntry({
			documentNavigation,
			navigationEntryPath: '/navigation.js',
			documentModuleLoader: undefined,
			routeSsrModulePreloads: {
				'pages/index.tsrx': ['/index-ssr.js'],
				'pages/next.tsrx': ['/next-ssr.js'],
			},
			routeModulePreloads: {
				'pages/index.tsrx': ['/index-nav.js'],
				'pages/next.tsrx': ['/next-nav.js'],
			},
			pageModuleLoaders: {
				'pages/index.tsrx': async () => ({
					default: {
						renderSsr: () => ({
							html: '<a href="/next" data-markless-router-link>Next</a>',
						}),
					},
				}),
				'pages/next.tsrx': async () => ({
					default: { renderSsr: () => ({ html: '<h1>Next page</h1>' }) },
				}),
			},
			routeFileIds: ['/pages/index.tsrx', '/pages/next.tsrx'],
		});
		const server = createServer(async (request, response) => {
			const path = request.url ?? '/';
			if (path.endsWith('.js')) {
				fetched.push(path);
				response.setHeader('content-type', 'text/javascript');
				response.end(
					path === '/navigation.js'
						? 'export async function navigateMarklessRouterLink(input) { history.pushState(null, "", input.href); document.body.dataset.clientNavigated = "1"; }'
						: '',
				);
				return;
			}
			response.setHeader('content-type', 'text/html');
			response.end(await (await entry.fetch(new Request(`https://docs.test${path}`))).text());
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		return {
			fetched,
			origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
			close: () => new Promise<void>((resolve) => server.close(() => resolve())),
		};
	}

	test('a URL-dependent document turns Link clicks into full document loads', async () => {
		const app = await serve('document');
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage();
			await page.goto(`${app.origin}/`);
			await page.evaluate(() => {
				(window as { beforeClick?: boolean }).beforeClick = true;
			});
			await page.getByText('Next').hover();
			await expect.poll(() => app.fetched).toContain('/next-ssr.js');
			expect(app.fetched).not.toContain('/next-nav.js');
			await page.getByText('Next').click();
			await page.getByText('Next page').waitFor();
			expect(
				await page.evaluate(() => (window as { beforeClick?: boolean }).beforeClick),
			).toBeUndefined();
			expect(app.fetched).not.toContain('/navigation.js');
		} finally {
			await browser.close();
			await app.close();
		}
	});

	test('a route-invariant document keeps Link clicks on client navigation', async () => {
		const app = await serve('client');
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage();
			await page.goto(`${app.origin}/`);
			await page.getByText('Next').hover();
			await expect.poll(() => app.fetched).toContain('/next-nav.js');
			await page.getByText('Next').click();
			await expect
				.poll(() => page.evaluate(() => document.body.dataset.clientNavigated))
				.toBe('1');
			expect(new URL(page.url()).pathname).toBe('/next');
			expect(app.fetched).toContain('/navigation.js');
		} finally {
			await browser.close();
			await app.close();
		}
	});
});
