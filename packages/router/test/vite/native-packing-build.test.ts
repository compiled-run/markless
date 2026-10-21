import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { clientAssetsManifestPath } from '../../src/vite/client-assets-manifest.ts';
import { createBuilder } from 'vite';
import { expect, test } from 'vitest';
import { MARKLESS_CHUNK_SPECIFIER_PREFIX, marklessImportMapPath } from '@markless/bundler/rolldown';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');

function counterPage(counters: number): string {
	const names = Array.from({ length: counters }, (_, index) => `tally${index}`);
	return [
		"import { state } from '@markless/core';",
		"import Toggle from '../parts/toggle.tsrx';",
		'export default function Home() @{',
		...names.map((name) => `\tlet ${name} = state(0);`),
		'\t<section>',
		...names.map(
			(name) => `\t\t<button type="button" onClick={() => ${name}++}>{${name}}</button>`,
		),
		'\t\t<Toggle label="more" />',
		'\t</section>',
		'}',
	].join('\n');
}

// Past the direct-load limit a page's symbols load through its resolver table,
// and a routed page is also transformed as a development-shaped route artifact.
test('a packed router build resolves every symbol of a page that loads through its resolver table', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-router-native-pack-'));
	try {
		await mkdir(join(root, 'pages'));
		await mkdir(join(root, 'parts'));
		await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
		for (const name of ['core', 'router'])
			await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
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
		await writeFile(
			join(root, 'parts/toggle.tsrx'),
			[
				"import { state } from '@markless/core';",
				'export default function Toggle({ label }: { readonly label: string }) @{',
				'\tlet on = state(false);',
				"\t<button type=\"button\" aria-pressed={on ? 'true' : 'false'} onClick={() => (on = !on)}>{label}</button>",
				'}',
			].join('\n'),
		);
		await writeFile(join(root, 'pages/index.tsrx'), counterPage(5));

		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless(), router()],
		});
		await builder.buildApp();

		const clientDir = join(root, '.output/public/build');
		const chunks = (await readdir(clientDir)).filter((file) => file.endsWith('.js'));
		const code = await Promise.all(chunks.map((file) => readFile(join(clientDir, file), 'utf8')));
		expect(code.join('\n')).not.toContain('virtual:markless:symbol:');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120_000);

// Chunks name each other by stable specifiers, so a renamed chunk changes only its own bytes and the document's map.
test('a packed router build serves one import map, ahead of every module preload, that resolves every chunk specifier and lists only shared chunks', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-router-import-map-'));
	try {
		await mkdir(join(root, 'pages'));
		await mkdir(join(root, 'parts'));
		await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
		for (const name of ['core', 'router'])
			await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
		await writeFile(join(root, 'package.json'), '{"name":"import-map-app","type":"module"}');
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
		await writeFile(
			join(root, 'parts/toggle.tsrx'),
			[
				"import { state } from '@markless/core';",
				'export default function Toggle({ label }: { readonly label: string }) @{',
				'\tlet on = state(false);',
				"\t<button type=\"button\" aria-pressed={on ? 'true' : 'false'} onClick={() => (on = !on)}>{label}</button>",
				'}',
			].join('\n'),
		);
		await writeFile(join(root, 'pages/index.tsrx'), counterPage(2));
		await writeFile(
			join(root, 'pages/about.tsrx'),
			[
				"import Toggle from '../parts/toggle.tsrx';",
				'export default function About() @{',
				'\t<Toggle label="about" />',
				'}',
			].join('\n'),
		);

		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless({ experimentalNativePacking: true }), router()],
		});
		await builder.buildApp();

		const clientDir = join(root, '.output/public/build');
		const chunks = (await readdir(clientDir)).filter((file) => file.endsWith('.js'));
		const code = (
			await Promise.all(chunks.map((file) => readFile(join(clientDir, file), 'utf8')))
		).join('\n');
		const specifiers = new Set(
			code.match(new RegExp(`${MARKLESS_CHUNK_SPECIFIER_PREFIX}[\\w-]+`, 'g')) ?? [],
		);
		expect(specifiers.size).toBeGreaterThan(0);
		const manifest = JSON.parse(
			await readFile(
				clientAssetsManifestPath(join(root, '.output/public')),
				'utf8',
			),
		) as {
			importMap: { imports: Record<string, string> };
			routes: { navigation: Record<string, readonly string[]> };
		};
		expect(Object.keys(manifest.importMap.imports).sort()).toEqual([...specifiers].sort());
		// A chunk named by its path is one only a single page loads; the toggle is about's alone.
		const byPath = new Set(
			[...code.matchAll(/["'`]\.\/(chunk-[\w-]+\.js)/g)].map((match) => match[1]!),
		);
		expect(byPath.size).toBeGreaterThan(0);
		for (const file of byPath)
			expect(
				Object.values(manifest.routes.navigation).filter((hrefs) =>
					hrefs.some((href) => href.endsWith(`/${file}`)),
				).length,
			).toBeLessThanOrEqual(1);
		for (const url of Object.values(manifest.importMap.imports))
			expect(chunks).toContain(url.replace(/^\/build\//, ''));
		// The files the client build hands the server build stay out of the statically served output.
		expect(await readdir(join(root, '.output/public'))).not.toContain('.vite');
		expect(
			JSON.parse(await readFile(marklessImportMapPath(join(root, '.output/public')), 'utf8')),
		).toEqual(manifest.importMap);

		const server = await startBuiltServer(join(root, '.output/server/index.mjs'));
		try {
			const html = await (await fetch(`${server.origin}/`)).text();
			for (const path of ['/.vite/markless-import-map.json', '/.vite/markless-router-client-manifest.json'])
				expect((await fetch(`${server.origin}${path}`)).headers.get('content-type')).not.toMatch(/json/);
			const maps = [...html.matchAll(/<script type="importmap">(.*?)<\/script>/g)];
			expect(maps).toHaveLength(1);
			expect(JSON.parse(maps[0]![1]!)).toEqual(manifest.importMap);
			const mapAt = html.indexOf('<script type="importmap">');
			expect(mapAt).toBeGreaterThan(html.indexOf('<meta charset="utf-8">'));
			expect(html.indexOf('rel="modulepreload"')).toBeGreaterThan(mapAt);
		} finally {
			server.close();
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120_000);
