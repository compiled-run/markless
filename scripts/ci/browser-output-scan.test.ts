import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { clientOutputDir, scanBrowserFile, scanBrowserOutput } from './browser-output-scan.mjs';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

test.each([
	['import{hostname as e}from"node:os";console.log(e);', 'imports "node:os", a Node built-in module'],
	['export*from"fs";', 'imports "fs", a Node built-in module'],
	['export{spawn}from"child_process";', 'imports "child_process", a Node built-in module'],
	['const e=()=>import("node:worker_threads");', 'imports "node:worker_threads", a Node built-in module'],
	['console.log(__dirname);', 'uses `__dirname` on line 1, a global only Node has'],
	['let e=1;\nexport const t=process.cwd();', 'uses `process` on line 2, a global only Node has'],
	['export const t=process.env.API;', 'uses `process` on line 1, a global only Node has'],
	['export const t=Buffer.from("a");', 'uses `Buffer` on line 1, a global only Node has'],
	[
		'var e=t=>{throw Error(`Calling \\`require\\` for "`+t+`" in an environment that doesn\'t expose the \\`require\\` function.`)};',
		"keeps a require() the bundler could not resolve, which throws in a browser",
	],
])('%s is reported', (code, finding) => {
	expect(scanBrowserFile(code)).toContain(finding);
});

test.each([
	'export const e=typeof process<"u"&&process.versions?.node;',
	'export const e=typeof Buffer>"u"?new Uint8Array:Buffer.from("a");',
	'export const e=globalThis.process?.env;',
	'export function e(process){return process.cwd()}',
	'import{e}from"./chunk-a.js";export{e};',
	'export const e="node:os and process.cwd()";',
])('%s is not reported', (code) => {
	expect(scanBrowserFile(code)).toEqual([]);
});

test("a build's browser output skips its server half and names each file", async () => {
	const root = await mkdtemp(join(await realpath(tmpdir()), 'markless-output-scan-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, 'dist/server'), { recursive: true });
	await mkdir(join(root, 'dist/build'), { recursive: true });
	await writeFile(join(root, 'dist/server/entry.js'), 'import"node:fs";');
	await writeFile(join(root, 'dist/build/chunk.js'), 'import"node:os";');
	await writeFile(
		join(root, 'dist/index.html'),
		[
			'<script type="importmap">{"imports":{"process":"./p.js"}}</script>',
			'<script type="markless/fill-plan">[process]: 1</script>',
			'<script>console.log(__filename)</script>',
		].join(''),
	);
	expect(clientOutputDir(root)).toBe(join(root, 'dist'));
	expect(scanBrowserOutput(clientOutputDir(root), root).toSorted()).toEqual([
		'dist/build/chunk.js: imports "node:os", a Node built-in module',
		'dist/index.html: uses `__filename` on line 1, a global only Node has',
	]);
});
