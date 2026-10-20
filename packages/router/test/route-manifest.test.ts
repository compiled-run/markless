import { expect, test } from 'vitest';
import {
	assertNoEndpointConflicts,
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

test('matches a page whose file name a URL percent-encodes', () => {
	const manifest = buildRouteManifestFromFileIds([
		'/pages/a b.tsrx',
		'/pages/folder with space/æøå.tsrx',
		'/pages/[slug].tsrx',
	]);

	expect(matchRouteManifest('/a%20b', manifest)?.route.file).toBe('pages/a b.tsrx');
	expect(matchRouteManifest('/folder%20with%20space/%C3%A6%C3%B8%C3%A5', manifest)?.route.file).toBe(
		'pages/folder with space/æøå.tsrx',
	);
	expect(matchRouteManifest('/a%2', manifest)?.route.file).toBe('pages/[slug].tsrx');
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

test('serves page files under pages/api/ as pages beside the endpoints in api/', () => {
	const manifest = buildRouteManifestFromFileIds([
		'/pages/api/index.tsrx',
		'/pages/api/reference.mdx',
		'/pages/api/contact.tsrx',
	]);
	expect(routePairs(manifest)).toEqual([
		['/api', 'pages/api/index.tsrx'],
		['/api/contact', 'pages/api/contact.tsrx'],
		['/api/reference', 'pages/api/reference.mdx'],
	]);
	expect(() =>
		assertNoEndpointConflicts(manifest, [
			'api/health.ts',
			'api/users/[id].get.ts',
			'api/contact.post.ts',
		]),
	).not.toThrow();
});

test('fails when a page and an endpoint both answer a GET at one address', () => {
	expect(() =>
		assertNoEndpointConflicts(buildRouteManifestFromFileIds(['/pages/api/health.tsrx']), [
			'api/health.get.ts',
		]),
	).toThrow(
		[
			'Route conflict: /api/health is answered by both a page and an endpoint:',
			'- pages/api/health.tsrx',
			'- api/health.get.ts',
		].join('\n'),
	);
	expect(() =>
		assertNoEndpointConflicts(buildRouteManifestFromFileIds(['/pages/api/[name].tsrx']), [
			'api/users.ts',
		]),
	).toThrow('Route conflict: /api/users is answered by both a page and an endpoint:');
	expect(() =>
		assertNoEndpointConflicts(buildRouteManifestFromFileIds(['/pages/api/index.tsrx']), [
			'api/[...rest].ts',
		]),
	).not.toThrow();
});

test('fails on non-final catch-all segments', () => {
	expect(() => buildRouteManifestFromFileIds(['/pages/docs/[...slug]/edit.tsrx'])).toThrow(
		'Catch-all route segments must be final: pages/docs/[...slug]/edit.tsrx',
	);
});

test('orders routes without a locale collator, which costs the first client navigation', () => {
	const localeCompare = String.prototype.localeCompare;
	String.prototype.localeCompare = () => {
		throw new Error('route manifests must not build an ICU collator');
	};
	try {
		const manifest = buildRouteManifestFromFileIds([
			'pages/zeta.tsrx',
			'pages/Alpha.tsrx',
			'pages/alpha.tsrx',
			'pages/[slug].tsrx',
			'pages/index.tsrx',
		]);
		expect(manifest.routes.map((route) => route.pathname)).toEqual([
			'/',
			'/Alpha',
			'/alpha',
			'/zeta',
			'/:slug',
		]);
	} finally {
		String.prototype.localeCompare = localeCompare;
	}
});
