import { expect, test } from 'vitest';
import {
	createServerEntry,
	type ServerEntryOptions,
} from '../../src/vite/runtime/create-server-entry.ts';
import { fragmentRequestUrl } from '../../src/vite/fragment-navigation.ts';

// A document.tsrx that writes <html> itself is served with that one root, never a second around it.

const shells = {
	authored:
		'<html lang="fr" class="paper" data-shell><head><meta charset="utf-8"><title>Shell</title></head><body>__children__</body></html>',
	alternate:
		'\n<html data-mode="dark"><head><title>Other</title></head><body class="frame"><main>__children__</main></body></html>\n',
};

function entry(shell: string, options: Partial<ServerEntryOptions> = {}) {
	return createServerEntry({
		navigationEntryPath: '/navigation.js',
		fragmentEntryPath: '/fragment.js',
		routeSsrModulePreloads: {},
		routeModulePreloads: {},
		documentModuleLoader: async () => ({
			default: {
				renderSsr: ({ children }: { readonly children: string }) => ({
					html: shell.replace('__children__', children),
				}),
			},
		}),
		pageModuleLoaders: {
			'pages/index.tsrx': async () => ({
				default: { renderSsr: () => ({ html: '<h1 data-page>Home</h1>' }) },
			}),
		},
		routeFileIds: ['/pages/index.tsrx'],
		...options,
	});
}

const htmlStartTags = (html: string) => html.match(/<html[\s>]/gi) ?? [];

for (const [label, shell] of Object.entries(shells)) {
	const rootTag = /<html[^>]*>/.exec(shell)![0];

	for (const documentNavigation of ['client', 'document'] as const) {
		test(`${label} <html>, ${documentNavigation} navigation: the page is served with exactly that one root`, async () => {
			const html = await (
				await entry(shell, { documentNavigation }).fetch(new Request('https://app.test/'))
			).text();
			expect(htmlStartTags(html)).toHaveLength(1);
			expect(html.startsWith(`<!doctype html>${rootTag}`)).toBe(true);
			expect(html.match(/<\/html>/g)).toHaveLength(1);
			expect(html).toContain('<h1 data-page>Home</h1>');
		});
	}

	test(`${label} <html>: a whole-document fragment carries one root`, async () => {
		const html = await (
			await entry(shell, { documentNavigation: 'document' }).fetch(
				new Request(fragmentRequestUrl('https://app.test/')),
			)
		).text();
		expect(htmlStartTags(html).length).toBeLessThanOrEqual(1);
		expect(html).toContain('<h1 data-page>Home</h1>');
	});
}

test('a document without its own <html> still gets the router root with the default lang', async () => {
	const html = await (
		await entry('<head><title>Bare</title></head><body>__children__</body>').fetch(
			new Request('https://app.test/'),
		)
	).text();
	expect(htmlStartTags(html)).toHaveLength(1);
	expect(html.startsWith('<!doctype html><html lang="en"><head>')).toBe(true);
});
