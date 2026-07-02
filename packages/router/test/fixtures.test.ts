import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'pathe';
import { expect, test } from 'vitest';
import { buildRouteManifestFromFileIds, type RouteManifest } from '../src/route-manifest.ts';
import { createRouteTypesDeclaration } from '../src/route-types.ts';
import { parseRequestFile, transformRequestFileSource } from '../src/request-files.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixturesRoot = join(repoRoot, 'packages/router/fixtures');
const ignoredFixtureEntries = new Set([
	'.markless',
	'.output',
	'markless-router-env.d.ts',
	'node_modules',
]);

const routePairs = (manifest: RouteManifest) =>
	manifest.routes.map((route) => [route.pathname, route.file]);

test('router app fixture exposes root UI and status page artifacts', async () => {
	const files = await fixtureFiles('router-app');

	expect(files).toEqual([
		'document.tsrx',
		'package.json',
		'pages/404.tsrx',
		'pages/500.tsrx',
		'pages/index.tsrx',
		'tsconfig.json',
		'vite.config.ts',
	]);

	const manifest = buildRouteManifestFromFileIds(files);

	expect(routePairs(manifest)).toEqual([['/', 'pages/index.tsrx']]);
	expect(manifest.statusPages).toEqual({
		error: 'pages/500.tsrx',
		notFound: 'pages/404.tsrx',
	});
	expect(createRouteTypesDeclaration(manifest)).toContain('MarklessRouterStaticPageHref');
});

test('router docs fixture exposes MDX docs routes and catch-all types', async () => {
	const files = await fixtureFiles('router-docs');
	const manifest = buildRouteManifestFromFileIds(files);
	const declaration = createRouteTypesDeclaration(manifest);

	expect(files).toEqual([
		'components/docs/Sidebar.tsrx',
		'components/layouts/DocsLayout.tsrx',
		'document.tsrx',
		'package.json',
		'pages/docs/[...slug].mdx',
		'pages/docs/index.mdx',
		'pages/index.mdx',
		'tsconfig.json',
		'vite.config.ts',
	]);
	expect(routePairs(manifest)).toEqual([
		['/', 'pages/index.mdx'],
		['/docs', 'pages/docs/index.mdx'],
		['/docs/**', 'pages/docs/[...slug].mdx'],
	]);
	expect(declaration).toContain(
		'export type MarklessRouterRoutePattern =\n\t| "/docs/[...slug]";',
	);
	expect(declaration).toContain('readonly slug: string | number | readonly (string | number)[];');
});

test('router full-stack fixture separates UI, request, and public artifacts', async () => {
	const files = await fixtureFiles('router-full-stack');
	const manifest = buildRouteManifestFromFileIds(files);
	const healthSource = await fixtureFileText('router-full-stack', 'api/health.ts');
	const middlewareSource = await fixtureFileText('router-full-stack', 'middleware/request.ts');

	expect(files).toEqual([
		'api/health.ts',
		'middleware/request.ts',
		'package.json',
		'pages/404.tsrx',
		'pages/500.tsrx',
		'pages/about.tsrx',
		'pages/index.tsrx',
		'public/markless-router.txt',
		'tsconfig.json',
		'vite.config.ts',
	]);
	expect(routePairs(manifest)).toEqual([
		['/', 'pages/index.tsrx'],
		['/about', 'pages/about.tsrx'],
	]);
	expect(manifest.statusPages).toEqual({
		error: 'pages/500.tsrx',
		notFound: 'pages/404.tsrx',
	});
	expect(parseRequestFile('api/health.ts', healthSource)).toMatchObject({
		diagnostics: [],
		kind: 'api',
		method: 'all',
		route: {
			params: [],
			pathname: '/api/health',
			pattern: '/api/health',
		},
	});
	expect(parseRequestFile('middleware/request.ts', middlewareSource)).toMatchObject({
		diagnostics: [],
		kind: 'middleware',
	});
	expect(transformRequestFileSource('api/health.ts', healthSource)?.code).toContain(
		'import { defineHandler as __markless_define_handler__ } from "nitro";',
	);
	expect(transformRequestFileSource('middleware/request.ts', middlewareSource)?.code).toContain(
		'__marklessCreateHttpContext',
	);
});

async function fixtureFiles(name: string): Promise<string[]> {
	const root = join(fixturesRoot, name);
	const files: string[] = [];

	await collectFiles(root, root, files);

	return files.toSorted((left, right) => left.localeCompare(right));
}

async function collectFiles(root: string, dir: string, files: string[]): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true });

	await Promise.all(
		entries.map(async (entry) => {
			if (ignoredFixtureEntries.has(entry.name)) {
				return;
			}

			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				await collectFiles(root, path, files);
				return;
			}

			if (entry.isFile()) {
				files.push(relative(root, path));
			}
		}),
	);
}

async function fixtureFileText(name: string, path: string): Promise<string> {
	return readFile(join(fixturesRoot, name, path), 'utf8');
}
