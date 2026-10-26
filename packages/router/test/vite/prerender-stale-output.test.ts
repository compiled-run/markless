import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterEach, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { prerenderedClientUrls } from '../../src/vite/nitro-prerender.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function toggle(label: string): string {
	return [
		"import { state } from '@markless/core';",
		'export default function Toggle({ label }: { readonly label: string }) @{',
		'\tlet on = state(false);',
		`\t<button type="button" aria-pressed={on ? 'true' : 'false'} onClick={() => (on = !on)}>{label} ${label}</button>`,
		'}',
	].join('\n');
}

async function app(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-prerender-stale-'));
	roots.push(root);
	await mkdir(join(root, 'pages'));
	await mkdir(join(root, 'parts'));
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	await writeFile(join(root, 'package.json'), '{"name":"prerender-stale-app","type":"module"}');
	await writeFile(
		join(root, 'document.tsrx'),
		[
			"import type { Children } from '@markless/core';",
			"import { Html } from '@markless/router';",
			'export default function Document({ children }: { readonly children?: Children }) @{',
			'\t<Html><head><meta charset="utf-8" /></head><body>{children}</body></Html>',
			'}',
		].join('\n'),
	);
	await writeFile(join(root, 'parts/toggle.tsrx'), toggle('first'));
	await writeFile(
		join(root, 'pages/index.tsrx'),
		[
			"import { state } from '@markless/core';",
			"import Toggle from '../parts/toggle.tsrx';",
			'export default function Home() @{',
			'\tlet count = state(0);',
			'\t<main>',
			'\t\t<button type="button" onClick={() => count++}>{count}</button>',
			'\t\t<Toggle label="home" />',
			'\t</main>',
			'}',
		].join('\n'),
	);
	await writeFile(
		join(root, 'pages/about.tsrx'),
		[
			"import Toggle from '../parts/toggle.tsrx';",
			'export default function About() @{',
			'\t<Toggle label="about" />',
			'}',
		].join('\n'),
	);
	return root;
}

async function build(root: string, nitro: Record<string, unknown> = {}): Promise<void> {
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless({ experimentalNativePacking: true }), router()],
		nitro: { prerender: { routes: ['/', '/about'] }, ...nitro },
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();
}

// Every client file a prerendered page loads: script and preload URLs plus import map targets.
async function prerenderedReferences(publicDir: string): Promise<Map<string, string[]>> {
	const pages = new Map<string, string[]>();
	for (const file of await readdir(publicDir, { recursive: true })) {
		if (!file.endsWith('.html')) continue;
		const html = await readFile(join(publicDir, file), 'utf8');
		const urls = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]!);
		for (const [, map] of html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g))
			urls.push(
				...Object.values((JSON.parse(map!) as { imports: Record<string, string> }).imports),
			);
		pages.set(file, urls);
	}
	return pages;
}

async function missingFiles(publicDir: string): Promise<string[]> {
	const pages = await prerenderedReferences(publicDir);
	expect(pages.size).toBe(2);
	const missing: string[] = [];
	for (const [page, urls] of pages) {
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls)
			if (!existsSync(join(publicDir, url))) missing.push(`${page} -> ${url}`);
	}
	return missing;
}

// A Vercel build in a folder that still holds a node build's .output must not serve that build's pages as its own.
test('a rebuild prerenders pages that load only files the rebuild emitted, whatever an earlier build left behind', async () => {
	const root = await app();
	await build(root);
	expect(await missingFiles(join(root, '.output/public'))).toEqual([]);

	await writeFile(join(root, 'parts/toggle.tsrx'), toggle('second'));
	await build(root);
	expect(await missingFiles(join(root, '.output/public'))).toEqual([]);

	await writeFile(join(root, 'parts/toggle.tsrx'), toggle('third'));
	await build(root, { preset: 'vercel' });
	expect(await missingFiles(join(root, '.vercel/output/static'))).toEqual([]);
	const vercelPage = await readFile(join(root, '.vercel/output/static/about/index.html'), 'utf8');
	expect(vercelPage).toContain('about third');
}, 240_000);

test('a build whose prerendered page loads a client file the build did not emit fails', async () => {
	const root = await app();
	const injectMissingFiles = {
		name: 'inject-missing-files',
		setup(nitro: {
			hooks: {
				hook(
					name: string,
					run: (route: { route: string; contents?: string }) => void,
				): void;
			};
		}) {
			nitro.hooks.hook('prerender:generate', (route) => {
				if (route.route !== '/about' || !route.contents) return;
				route.contents = route.contents
					.replace(
						'<head>',
						'<head><link rel="modulepreload" href="/build/chunk-gone0000.js">',
					)
					.replace(
						'{"imports":{',
						'{"imports":{"@markless/c/gone0000":"/build/chunk-gone1111.js",',
					);
			});
		},
	};
	await expect(build(root, { modules: [injectMissingFiles] })).rejects.toThrow(
		/about[\s\S]*\/build\/chunk-gone0000\.js[\s\S]*\/build\/chunk-gone1111\.js/,
	);
}, 120_000);

test('the prerender check reads script, link and import map targets under the client folders and the base path', () => {
	const html = [
		'<script type="importmap">{"imports":{"@markless/c/a":"/docs/build/chunk-a.js"},"scopes":{"/docs/":{"@markless/c/b":"/docs/build/chunk-b.js"}}}</script>',
		'<link rel="modulepreload" href="/docs/build/chunk-c.js">',
		'<link rel="stylesheet" href="/docs/build/style.css?v=1">',
		'<script type="module" src="/docs/_markless/links/l.js"></script>',
		'<link rel="icon" href="/docs/favicon.ico">',
		'<script src="https://cdn.example/build/x.js"></script>',
		'<a href="/docs/build/not-loaded.js">source</a>',
	].join('');
	expect(prerenderedClientUrls(html, '/docs/', ['build/', '_markless/links'])).toEqual([
		'/docs/build/chunk-c.js',
		'/docs/build/style.css?v=1',
		'/docs/_markless/links/l.js',
		'/docs/build/chunk-a.js',
		'/docs/build/chunk-b.js',
	]);
});
