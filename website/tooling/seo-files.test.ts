import { expect, test } from 'vitest';
import { flatNav, siteOrigin } from '../nav.ts';
import { seoFileContents, seoFiles } from './seo-files.ts';

test('llms.txt and the sitemap list every sidebar page, and llms.txt names the version', () => {
	const files = seoFileContents('1.2.3');
	expect(files['llms.txt']).toContain('written against @markless/* 1.2.3');
	for (const entry of flatNav) {
		expect(files['llms.txt']).toContain(`(${siteOrigin}${entry.href})`);
		expect(files['sitemap.xml']).toContain(`<loc>${siteOrigin}${entry.href}</loc>`);
	}
	expect(files['robots.txt']).toContain(`Sitemap: ${siteOrigin}/sitemap.xml`);
	expect(seoFileContents('1.2.3')).toEqual(files);
});

test('the client build emits the three files and the server build emits none', () => {
	const plugin = seoFiles();
	const generateBundle = plugin.generateBundle as (this: unknown) => void;
	const emitted = (consumer: string) => {
		const files: string[] = [];
		generateBundle.call({
			environment: { config: { consumer } },
			emitFile: (file: { fileName: string }) => files.push(file.fileName),
		});
		return files;
	};
	expect(emitted('client').toSorted()).toEqual(['llms.txt', 'robots.txt', 'sitemap.xml']);
	expect(emitted('server')).toEqual([]);
});

test('the dev server answers the three files under the base path and passes everything else on', () => {
	const plugin = seoFiles();
	(plugin.configResolved as (config: { base: string }) => void)({ base: '/docs/' });
	let middleware: (req: { url: string }, res: unknown, next: () => void) => void = () => {};
	(plugin.configureServer as (server: unknown) => void)({
		middlewares: { use: (handler: typeof middleware) => (middleware = handler) },
	});
	const request = (url: string) => {
		const sent: { type?: string; body?: string; passed: boolean } = { passed: false };
		middleware(
			{ url },
			{
				setHeader: (_name: string, value: string) => (sent.type = value),
				end: (body: string) => (sent.body = body),
			},
			() => (sent.passed = true),
		);
		return sent;
	};
	expect(request('/docs/llms.txt?x=1')).toMatchObject({ type: 'text/plain; charset=utf-8', passed: false });
	expect(request('/docs/llms.txt').body).toContain('written against @markless/*');
	expect(request('/docs/sitemap.xml').type).toBe('application/xml; charset=utf-8');
	expect(request('/llms.txt').passed).toBe(true);
	expect(request('/docs/concepts/state').passed).toBe(true);
});
