import { expect, test } from 'vitest';
import {
	createServerEntry,
	type ServerEntryOptions,
} from '../../src/vite/runtime/create-server-entry.ts';
import { fragmentRequestUrl } from '../../src/vite/fragment-navigation.ts';

const page = (html: string) => async () => ({
	default: { renderSsr: () => ({ html, state: { version: 1, cells: [] } }) },
});

const sources = {
	'/assets/doc.css': 'body{--doc:1}',
	'/assets/shared.css': '.nav{--shared:1}',
	'/assets/index.css': '.home{--index:1}',
	'/assets/next.css': '.next{--next:1}',
};

function entry(options: Partial<ServerEntryOptions> = {}) {
	return createServerEntry({
		navigationEntryPath: '/navigation.js',
		fragmentEntryPath: '/fragment.js',
		routeSsrModulePreloads: { 'pages/index.tsrx': ['/i.js'], 'pages/next.tsrx': ['/n.js'] },
		routeModulePreloads: { 'pages/index.tsrx': ['/i.js'], 'pages/next.tsrx': ['/n.js'] },
		routeStylesheets: {
			'pages/index.tsrx': ['/assets/shared.css', '/assets/index.css'],
			'pages/next.tsrx': ['/assets/shared.css', '/assets/next.css'],
		},
		documentStylesheets: ['/assets/doc.css'],
		stylesheetSources: sources,
		documentModuleLoader: async () => ({
			default: {
				renderSsr: ({ children }: { readonly children: string }) => ({
					html: `<html><head><meta charset="utf-8"></head><body>${children}</body></html>`,
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

const headOf = (html: string) => html.slice(0, html.indexOf('</head>'));

test('a document carries each stylesheet it links as inline text, in the order it linked them', async () => {
	const html = await (await entry().fetch(new Request('https://app.test/'))).text();
	const head = headOf(html);
	expect(head).not.toContain('rel="stylesheet"');
	const order = ['/assets/doc.css', '/assets/shared.css', '/assets/index.css'].map((href) =>
		head.indexOf(
			`<style data-markless-css="${href}">${sources[href as keyof typeof sources]}</style>`,
		),
	);
	expect(order.every((at) => at > 0)).toBe(true);
	expect(order).toEqual([...order].sort((left, right) => left - right));
});

test('a fragment names the stylesheets every page has and carries the text of its own', async () => {
	const app = entry();
	const fragment = await (
		await app.fetch(new Request(fragmentRequestUrl('https://app.test/next')))
	).text();
	expect(fragment).toContain(
		'<link rel="stylesheet" href="/assets/doc.css" data-markless-css="/assets/doc.css">',
	);
	expect(fragment).toContain(
		'<link rel="stylesheet" href="/assets/shared.css" data-markless-css="/assets/shared.css">',
	);
	expect(fragment).toContain(
		'<style data-markless-css="/assets/next.css">.next{--next:1}</style>',
	);
	expect(fragment).not.toContain('--doc');
	expect(fragment).not.toContain('--shared');
});

test('a press preloads no stylesheet the destination carries inline', async () => {
	const html = await (await entry().fetch(new Request('https://app.test/'))).text();
	expect(html).not.toContain('/assets/next.css');
});

test('a stylesheet the build holds no text for stays a link', async () => {
	const html = await (
		await entry({ stylesheetSources: { '/assets/doc.css': sources['/assets/doc.css'] } }).fetch(
			new Request('https://app.test/'),
		)
	).text();
	expect(html).toContain('<link rel="stylesheet" href="/assets/index.css">');
	expect(html).toContain('<style data-markless-css="/assets/doc.css">');
});

test('stylesheet text that spells a closing style tag cannot end its element', async () => {
	const html = await (
		await entry({
			stylesheetSources: {
				...sources,
				'/assets/index.css': '.a::after{content:"</style><b>"}',
			},
		}).fetch(new Request('https://app.test/'))
	).text();
	expect(html).toContain('.a::after{content:"<\\/style><b>"}</style>');
});
