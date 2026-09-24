import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { collapseInitFacadeImports } from '../src/build/init-facade-imports.ts';

type TestChunk = {
	type: 'chunk';
	fileName: string;
	code: string;
	imports: string[];
	dynamicImports: string[];
	moduleIds: string[];
	exports: string[];
	isEntry?: boolean;
};

function chunk(
	fileName: string,
	code: string,
	links: Partial<
		Pick<TestChunk, 'imports' | 'dynamicImports' | 'moduleIds' | 'exports' | 'isEntry'>
	> = {},
): TestChunk {
	return {
		type: 'chunk',
		fileName,
		code,
		imports: [],
		dynamicImports: [],
		moduleIds: [],
		exports: [],
		...links,
	};
}

// The shape a destructured `await import()` of a module packed into a shared chunk takes.
function lazyBundle(entryCode: string, facadeCode?: string): Record<string, TestChunk> {
	return {
		'entry.mjs': chunk('entry.mjs', entryCode, {
			dynamicImports: ['facade.mjs'],
			moduleIds: ['entry'],
			exports: ['load'],
			isEntry: true,
		}),
		'side.mjs': chunk('side.mjs', 'globalThis.trace.push("side");export const side=1;', {
			moduleIds: ['side'],
			exports: ['side'],
		}),
		'shared.mjs': chunk(
			'shared.mjs',
			'import"./side.mjs";let count,ready;function init(){if(ready)return;ready=1;globalThis.trace.push("init");count=1}function bump(){count++}export{init as a,count as c,bump as b};',
			{ imports: ['side.mjs'], moduleIds: ['shared'], exports: ['a', 'c', 'b'] },
		),
		'facade.mjs': chunk(
			'facade.mjs',
			facadeCode ??
				'import"./side.mjs";import{a as e,c as t,b as n}from"./shared.mjs";e();export{t as count,n as bump};',
			{ imports: ['side.mjs', 'shared.mjs'], exports: ['count', 'bump'] },
		),
	};
}

const DESTRUCTURING_ENTRY =
	'export async function load(){let{count:e,bump:t}=await import("./facade.mjs");t();let{count:n}=await import(`./facade.mjs`);return[e,n]}';

async function run(bundle: Record<string, TestChunk>): Promise<unknown> {
	const directory = await mkdtemp(join(tmpdir(), 'markless-init-facades-'));
	try {
		for (const item of Object.values(bundle))
			await writeFile(join(directory, item.fileName), item.code);
		const url = pathToFileURL(join(directory, 'entry.mjs')).href;
		return JSON.parse(
			execFileSync(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					`globalThis.trace=[];const entry=await import(${JSON.stringify(url)});const before=[...trace];const values=await entry.load();console.log(JSON.stringify({before,values,trace}));`,
				],
				{ encoding: 'utf8' },
			),
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test('a destructured request goes straight to the shared chunk and runs its init there', async () => {
	const original = await run(lazyBundle(DESTRUCTURING_ENTRY));
	const bundle = lazyBundle(DESTRUCTURING_ENTRY);

	expect([...collapseInitFacadeImports(bundle)]).toEqual(['facade.mjs']);

	expect(bundle['facade.mjs']).toBeUndefined();
	expect(bundle['entry.mjs']!.dynamicImports).toEqual(['shared.mjs']);
	expect(bundle['entry.mjs']!.code).not.toContain('facade.mjs');
	expect(await run(bundle)).toEqual(original);
	expect(original).toEqual({ before: [], values: [1, 2], trace: ['side', 'init'] });
});

test.each([
	[
		'a request that keeps the namespace',
		'export async function load(){const m=await import("./facade.mjs");return[m.count]}',
	],
	[
		'a request chained off the promise',
		'export async function load(){return[await import("./facade.mjs").then(m=>m.count)]}',
	],
	[
		'a rest element',
		'export async function load(){let{count:e,...r}=await import("./facade.mjs");return[e]}',
	],
])('leaves the facade alone for %s', (_, entryCode) => {
	const bundle = lazyBundle(entryCode);
	const code = bundle['entry.mjs']!.code;

	expect([...collapseInitFacadeImports(bundle)]).toEqual([]);

	expect(bundle['facade.mjs']).toBeDefined();
	expect(bundle['entry.mjs']!.code).toBe(code);
});

test('leaves the facade alone when its ordering import is not one the shared chunk already runs', () => {
	const bundle = lazyBundle(DESTRUCTURING_ENTRY);
	bundle['shared.mjs']!.code = bundle['shared.mjs']!.code.replace('import"./side.mjs";', '');
	bundle['shared.mjs']!.imports = [];

	expect([...collapseInitFacadeImports(bundle)]).toEqual([]);
	expect(bundle['facade.mjs']).toBeDefined();
});

test('leaves a facade that does more than run an init and re-export', () => {
	const bundle = lazyBundle(
		DESTRUCTURING_ENTRY,
		'import{a as e,c as t,b as n}from"./shared.mjs";e();globalThis.trace.push("facade");export{t as count,n as bump};',
	);

	expect([...collapseInitFacadeImports(bundle)]).toEqual([]);
});
