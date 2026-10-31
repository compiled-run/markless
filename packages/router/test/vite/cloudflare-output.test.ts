import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { MARKLESS_BUILD_PREFIX } from '@markless/bundler/rolldown';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { pruneRenderedPages, workerFirstPatterns } from '../../src/vite/nitro-cloudflare.ts';
import { FRAGMENT_PATH_PREFIX } from '../../src/vite/fragment-navigation.ts';

// A Nitro `cloudflare-module` build served by wrangler's local workerd, which applies Workers static
// assets routing: a request that names an asset file never runs the Worker, so it is free.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const wrangler = resolve(import.meta.dirname, '../../node_modules/.bin/wrangler');
const SERVED_FROM_ASSETS = '<!--served from the uploaded file-->';
let root = '';
let origin = '';
let worker: ChildProcess | undefined;

const heldAnswers: ServerResponse[] = [];
let holding = false;
const gate = createServer((_request, response) => {
	if (holding) heldAnswers.push(response);
	else response.end();
});
const releaseGate = () => {
	holding = false;
	for (const response of heldAnswers.splice(0)) response.end();
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-cloudflare-'));
	await cp(resolve(import.meta.dirname, '../fixtures/prerender-app'), root, { recursive: true });
	await new Promise<void>((listening) => gate.listen(0, '127.0.0.1', listening));
	const gateUrl = `http://127.0.0.1:${(gate.address() as AddressInfo).port}/`;
	await mkdir(join(root, 'pages/docs'), { recursive: true });
	await writeFile(
		join(root, 'pages/docs/intro.tsrx'),
		'export default function Intro() @{\n\t<main data-page="intro">Prerendered intro</main>\n}\n',
	);
	await writeFile(
		join(root, 'pages/held.tsrx'),
		[
			"import { computed } from '@markless/core';",
			'',
			'export default function Held() @{',
			'\tconst report = computed(async () => {',
			`\t\tawait fetch(${JSON.stringify(gateUrl)});`,
			"\t\treturn { text: 'report ready' };",
			'\t});',
			'',
			'\t<main data-page="held">',
			'\t\t@try {',
			'\t\t\t<p data-settled>{report.text}</p>',
			'\t\t} @pending {',
			'\t\t\t<p data-pending>loading report</p>',
			'\t\t} @catch {',
			'\t\t\t<p data-failed>report failed</p>',
			'\t\t}',
			'\t</main>',
			'}',
		].join('\n'),
	);
	await writeFile(
		join(root, 'package.json'),
		'{ "name": "markless-cloudflare-test", "private": true }\n',
	);
	// Like unicorn-magic: its default build, for runtimes without Node's APIs, lacks what its Node build exports.
	const nodeOnly = join(root, 'node_modules/node-build-only');
	await mkdir(nodeOnly, { recursive: true });
	await writeFile(
		join(nodeOnly, 'package.json'),
		JSON.stringify({
			name: 'node-build-only',
			type: 'module',
			exports: { node: { import: './node.js' }, default: { import: './default.js' } },
		}),
	);
	await writeFile(
		join(nodeOnly, 'node.js'),
		"import { fileURLToPath } from 'node:url';\nexport const toPath = (url) => fileURLToPath(url);\n",
	);
	await writeFile(join(nodeOnly, 'default.js'), 'export const other = 1;\n');
	await mkdir(join(root, 'api'), { recursive: true });
	await writeFile(
		join(root, 'api/path.ts'),
		"import { toPath } from 'node-build-only';\nexport default () => Response.json({ path: toPath('file:///a/b') });\n",
	);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	const prerendered = ['/', '/guide', '/docs/intro'];
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		nitro: {
			preset: 'cloudflare-module',
			// Nitro defaults to today's date, which the pinned wrangler's workerd refuses once UTC passes its release day.
			compatibilityDate: '2026-10-01',
			compressPublicAssets: { gzip: true, brotli: true },
			routeRules: Object.fromEntries(
				prerendered.flatMap((path) => [
					[path, { prerender: true }],
					[`${FRAGMENT_PATH_PREFIX}${path}`, { prerender: true }],
				]),
			),
		},
		plugins: [markless(), router()],
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();
	// A response carrying this comment came from the uploaded file, not from the Worker rendering the page again.
	for (const file of await htmlFiles())
		await writeFile(file, (await readFile(file, 'utf8')) + SERVED_FROM_ASSETS);
	origin = await startWrangler(join(root, '.output/server/wrangler.json'));
}, 240_000);

afterAll(async () => {
	worker?.kill();
	releaseGate();
	gate.close();
	if (root) await rm(root, { recursive: true, force: true });
});

async function htmlFiles(): Promise<string[]> {
	const publicDir = join(root, '.output/public');
	return (await readdir(publicDir, { recursive: true }))
		.filter((file) => file.endsWith('.html'))
		.map((file) => join(publicDir, file));
}

function startWrangler(config: string): Promise<string> {
	const child = spawn(
		wrangler,
		[
			'dev',
			'--config',
			config,
			'--ip',
			'127.0.0.1',
			'--port',
			'0',
			'--show-interactive-dev-session=false',
		],
		{
			cwd: root,
			env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	worker = child;
	let output = '';
	return new Promise((ready, fail) => {
		const read = (chunk: Buffer) => {
			output += chunk.toString();
			const listening = /Ready on (http:\/\/\S+)/.exec(output);
			if (listening) ready(listening[1]!);
		};
		child.stdout!.on('data', read);
		child.stderr!.on('data', read);
		child.once('exit', (code) => fail(new Error(`wrangler dev exited (${code}):\n${output}`)));
	});
}

// Local workerd holds a compressed stream until it ends; Cloudflare's edge flushes it (measured on workers.dev).
const get = (path: string) =>
	fetch(origin + path, { redirect: 'manual', headers: { 'accept-encoding': 'identity' } });

test('a prerendered page and its fragment URL are answered from the uploaded files at their own paths, without a redirect', async () => {
	for (const path of ['/', '/guide', '/docs/intro']) {
		for (const url of [path, `${FRAGMENT_PATH_PREFIX}${path}`]) {
			const response = await get(url);
			expect(response.status, url).toBe(200);
			expect(response.headers.get('content-type'), url).toMatch(/^text\/html/);
			expect(await response.text(), url).toContain(SERVED_FROM_ASSETS);
		}
	}
});

test('a page that is not prerendered streams from the Worker, its @pending arm arriving before its data', async () => {
	holding = true;
	const response = await get('/held');
	expect(response.status).toBe(200);
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let firstText = '';
	let all = '';
	for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
		all += decoder.decode(chunk.value, { stream: true });
		if (!firstText && all.includes('loading report')) {
			firstText = all;
			releaseGate();
		}
	}
	expect(firstText).not.toContain('report ready');
	expect(all).toContain('report ready');
	expect(all).not.toContain(SERVED_FROM_ASSETS);
});

test('a client chunk is a static file kept by browsers for a year, and no compressed copy is uploaded beside it', async () => {
	const publicDir = join(root, '.output/public');
	const chunk = (await readdir(join(publicDir, MARKLESS_BUILD_PREFIX))).find((file) =>
		file.endsWith('.js'),
	)!;
	const response = await get(`/${MARKLESS_BUILD_PREFIX}${chunk}`);
	expect(response.status).toBe(200);
	expect(response.headers.get('content-type')).toMatch(/javascript/);
	expect(response.headers.get('cache-control')).toContain('immutable');
	expect(
		Buffer.from(await response.arrayBuffer()).equals(
			await readFile(join(publicDir, MARKLESS_BUILD_PREFIX, chunk)),
		),
	).toBe(true);
	const config = JSON.parse(
		await readFile(join(root, '.output/server/wrangler.json'), 'utf8'),
	) as {
		assets: { run_worker_first?: unknown };
	};
	expect(config.assets.run_worker_first).toBeUndefined();
	const copies = (await readdir(publicDir, { recursive: true })).filter((file) =>
		/\.(?:br|gz|zst)$/.test(file),
	);
	expect(copies).toEqual([]);
});

test('the Worker leaves out the modules of pages it never renders, because every URL of theirs is a prerendered file', async () => {
	const serverDir = join(root, '.output/server');
	const code = await Promise.all(
		(await readdir(serverDir, { recursive: true }))
			.filter((file) => file.endsWith('.mjs'))
			.map((file) => readFile(join(serverDir, file), 'utf8')),
	);
	const shipped = (text: string) => code.some((source) => source.includes(text));
	expect(shipped('Prerendered guide')).toBe(false);
	expect(shipped('Prerendered intro')).toBe(false);
	expect(shipped('loading report')).toBe(true);
	const missing = await get('/no-such-page');
	expect(missing.status).toBe(404);
});

test('a page whose URL, in either spelling, run_worker_first sends to the Worker keeps its module', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'markless-cloudflare-prune-'));
	try {
		await writeFile(
			join(dir, 'index.mjs'),
			'export const pages = { "/pages/a.tsrx": () => import("./a.mjs"), "/pages/b.tsrx": () => import("./b.mjs") };\n',
		);
		await writeFile(join(dir, 'a.mjs'), 'export default "a";\n');
		await writeFile(join(dir, 'b.mjs'), 'export default "b";\n');
		const prerendered = new Set([
			'/a',
			`${FRAGMENT_PATH_PREFIX}/a`,
			'/b',
			`${FRAGMENT_PATH_PREFIX}/b`,
		]);
		expect(await pruneRenderedPages(dir, prerendered, ['/b/', '!/b/static/*'])).toMatchObject({
			pages: 1,
		});
		expect((await readdir(dir)).toSorted()).toEqual(['b.mjs', 'index.mjs']);
		expect(
			await pruneRenderedPages(dir, prerendered, [
				'/*',
				'!/b',
				'!/b/',
				'!/_markless/fragment/*',
			]),
		).toMatchObject({
			pages: 1,
		});
		expect((await readdir(dir)).toSorted()).toEqual(['index.mjs']);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('pages are left out only when every environment serves prerendered URLs from their files', () => {
	expect(
		workerFirstPatterns({ main: 'index.mjs', assets: { run_worker_first: ['/api/*'] } }),
	).toEqual(['/api/*']);
	expect(
		workerFirstPatterns({
			main: 'index.mjs',
			env: { production: { assets: { run_worker_first: true } } },
		}),
	).toBeUndefined();
	expect(
		workerFirstPatterns({
			main: 'index.mjs',
			env: { staging: { assets: { run_worker_first: ['/x'] } } },
		}),
	).toEqual(['/x']);
	expect(
		workerFirstPatterns({ main: 'index.mjs', assets: { html_handling: 'none' } }),
	).toBeUndefined();
	expect(
		workerFirstPatterns({ main: 'index.mjs', pages_build_output_dir: '..' }),
	).toBeUndefined();
});

test('a dependency with only a Node build and a default one runs its Node build in the Worker', async () => {
	const response = await get('/api/path');
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ path: '/a/b' });
});

