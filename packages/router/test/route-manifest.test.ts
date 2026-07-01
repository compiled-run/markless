import { expect, test } from 'vitest';
import {
	buildRouteManifestFromFileIds,
	matchRouteManifest,
	type RouteManifest,
} from '../src/route-manifest.ts';

const routePairs = (manifest: RouteManifest) =>
	manifest.routes.map((route) => [route.pathname, route.file]);

test('builds Markless Router routes from .tsrx and .mdx pages only', () => {
	const manifest = buildRouteManifestFromFileIds([
		'/pages/index.tsrx',
		'/pages/about.tsrx',
		'/pages/blog/[slug].tsrx',
		'/pages/docs/[...slug].mdx',
		'/pages/legacy.tsx',
		'/pages/legacy.jsx',
	]);

	expect(routePairs(manifest)).toEqual([
		['/', 'pages/index.tsrx'],
		['/about', 'pages/about.tsrx'],
		['/blog/:slug', 'pages/blog/[slug].tsrx'],
		['/docs/**', 'pages/docs/[...slug].mdx'],
	]);
});

test('keeps top-level request and asset directories out of UI routes', () => {
	const manifest = buildRouteManifestFromFileIds([
		'/pages/index.tsrx',
		'/api/health.tsrx',
		'/middleware/auth.tsrx',
		'/public/example.tsrx',
		'/src/pages/hidden.tsrx',
	]);

	expect(routePairs(manifest)).toEqual([['/', 'pages/index.tsrx']]);
});

test('matches static routes before dynamic routes and extracts params', () => {
	const manifest = buildRouteManifestFromFileIds([
		'/pages/blog/[slug].tsrx',
		'/pages/blog/test.tsrx',
		'/pages/docs/[...slug].mdx',
	]);

	expect(matchRouteManifest('/blog/test', manifest)).toMatchObject({
		route: { file: 'pages/blog/test.tsrx' },
		params: {},
	});
	expect(matchRouteManifest('/blog/hello', manifest)).toMatchObject({
		route: { file: 'pages/blog/[slug].tsrx' },
		params: { slug: 'hello' },
	});
	expect(matchRouteManifest('/docs/guides/getting-started', manifest)).toMatchObject({
		route: { file: 'pages/docs/[...slug].mdx' },
		params: { slug: 'guides/getting-started' },
	});
	expect(matchRouteManifest('/missing', manifest)).toBeUndefined();
});

test('reserves root status pages without adding normal status routes', () => {
	const manifest = buildRouteManifestFromFileIds([
		'/pages/index.tsrx',
		'/pages/404.tsrx',
		'/pages/500.mdx',
	]);

	expect(routePairs(manifest)).toEqual([['/', 'pages/index.tsrx']]);
	expect(manifest.statusPages).toEqual({
		notFound: 'pages/404.tsrx',
		error: 'pages/500.mdx',
	});
});

test('fails on route conflicts across TSRX and MDX', () => {
	expect(() => buildRouteManifestFromFileIds(['/pages/docs.tsrx', '/pages/docs.mdx'])).toThrow(
		['Route conflict: /docs is defined by both:', '- pages/docs.mdx', '- pages/docs.tsrx'].join(
			'\n',
		),
	);
});

test('fails on static and dynamic route conflicts with exact files', () => {
	expect(() =>
		buildRouteManifestFromFileIds(['/pages/blog.tsrx', '/pages/blog/index.tsrx']),
	).toThrow(
		[
			'Route conflict: /blog is defined by both:',
			'- pages/blog.tsrx',
			'- pages/blog/index.tsrx',
		].join('\n'),
	);
	expect(() =>
		buildRouteManifestFromFileIds(['/pages/blog/[id].tsrx', '/pages/blog/[slug].tsrx']),
	).toThrow(
		[
			'Route conflict: /blog/:param is defined by both:',
			'- pages/blog/[id].tsrx',
			'- pages/blog/[slug].tsrx',
		].join('\n'),
	);
});

test('fails on page-tree API routes and non-final catch-all segments', () => {
	expect(() => buildRouteManifestFromFileIds(['/pages/api/health.tsrx'])).toThrow(
		'API routes inside pages/ are not supported. Use top-level api/: pages/api/health.tsrx',
	);
	expect(() => buildRouteManifestFromFileIds(['/pages/docs/[...slug]/edit.tsrx'])).toThrow(
		'Catch-all route segments must be final: pages/docs/[...slug]/edit.tsrx',
	);
});
