import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import {
	unwrapAsyncImportWrappers,
	unwrapAsyncImportWrappersInCode,
} from '../src/build/async-import-wrappers.ts';

const TARGET = 'function b(){return this}export const n=1,m=2;export{b};';

async function run(entryCode: string): Promise<unknown> {
	const directory = await mkdtemp(join(tmpdir(), 'markless-async-wrappers-'));
	try {
		await writeFile(join(directory, 'target.mjs'), TARGET);
		await writeFile(join(directory, 'entry.mjs'), entryCode);
		const url = pathToFileURL(join(directory, 'entry.mjs')).href;
		return JSON.parse(
			execFileSync(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					`const entry=await import(${JSON.stringify(url)});console.log(JSON.stringify(await entry.load()));`,
				],
				{ encoding: 'utf8' },
			),
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

const WRAPPER = '(async()=>{let{n:e,m:t}=await import("./target.mjs");return{first:e,second:t}})()';

test.each([
	[
		'a member read',
		`export async function load(){return(await ${WRAPPER}).second}`,
		'return(await import("./target.mjs")).m',
	],
	[
		'a destructured read',
		`export async function load(){let{first:a,second}=await ${WRAPPER};return[a,second]}`,
		'let{n:a,m:second}=await import("./target.mjs")',
	],
	[
		'a reader that keeps the object',
		`export async function load(){let o=await ${WRAPPER};return Object.keys(o)}`,
		'import("./target.mjs").then(m=>({first:m.n,second:m.m}))',
	],
])('%s loses the wrapper and reads the same values', async (_, entryCode, expected) => {
	const unwrapped = unwrapAsyncImportWrappersInCode(entryCode);

	expect(unwrapped).toContain(expected);
	expect(unwrapped).not.toContain('async()=>');
	expect(await run(unwrapped)).toEqual(await run(entryCode));
});

test('a method call keeps the snapshot object as its receiver', async () => {
	const entryCode =
		'export async function load(){let r=(await (async()=>{let{b:e}=await import("./target.mjs");return{self:e}})()).self();return Object.keys(r)}';
	const unwrapped = unwrapAsyncImportWrappersInCode(entryCode);

	expect(unwrapped).toContain('.then(m=>({self:m.b}))');
	expect(await run(unwrapped)).toEqual(['self']);
	expect(await run(unwrapped)).toEqual(await run(entryCode));
});

test.each([
	[
		'a wrapper that does more',
		'(async()=>{let{n:e}=await import("./target.mjs");f();return{n:e}})()',
	],
	[
		'a returned value it did not destructure',
		'(async()=>{let{n:e}=await import("./target.mjs");return{n:e,x:y}})()',
	],
	['a rest element', '(async()=>{let{n:e,...r}=await import("./target.mjs");return{n:e}})()'],
	['a default value', '(async()=>{let{n:e=1}=await import("./target.mjs");return{n:e}})()'],
])('leaves %s alone', (_, wrapper) => {
	const code = `export const p=${wrapper};`;

	expect(unwrapAsyncImportWrappersInCode(code)).toBe(code);
});

test('rewrites every chunk in the bundle and skips other outputs', () => {
	const code = `export const p=(await ${WRAPPER}).first;`;
	const bundle: Record<string, { type: string; code?: string; source?: string }> = {
		'a.js': { type: 'chunk', code },
		'a.css': { type: 'asset', source: code },
	};

	unwrapAsyncImportWrappers(bundle);

	expect(bundle['a.js']!.code).toBe('export const p=(await import("./target.mjs")).n;');
	expect(bundle['a.css']!.source).toBe(code);
});
