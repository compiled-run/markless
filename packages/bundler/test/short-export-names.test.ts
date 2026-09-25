import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown, type OutputChunk } from 'rolldown';
import { expect, test } from 'vitest';
import { planShortExportNames, shortNames } from '../src/build/short-export-names.ts';
import { nativePackingPlugins } from '../src/build/native-packing.ts';

async function buildPacked(sources: Record<string, string>) {
	const build = await rolldown({
		input: { first: '/app/first.js', second: '/app/second.js' },
		plugins: [
			{
				name: 'memory',
				resolveId: (id) => {
					const resolved = id.startsWith('./') ? `/app/${id.slice(2)}` : id;
					return resolved in sources ? resolved : null;
				},
				load: (id) => sources[id],
			},
			...nativePackingPlugins(() => '/app'),
		],
	});
	try {
		const { output } = await build.generate({ format: 'es', minify: true });
		return output.filter((item): item is OutputChunk => item.type === 'chunk');
	} finally {
		await build.close();
	}
}

async function run(chunks: readonly OutputChunk[]) {
	const directory = await mkdtemp(join(tmpdir(), 'markless-short-names-'));
	try {
		for (const chunk of chunks) await writeFile(join(directory, chunk.fileName), chunk.code);
		const results = [];
		for (const entry of chunks.filter((chunk) => chunk.isEntry))
			results.push(
				await (await import(pathToFileURL(join(directory, entry.fileName)).href)).result(),
			);
		return results;
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

const sources: Record<string, string> = {
	'/app/first.js': [
		'import { aVeryLongSharedHelperName, anotherQuiteLongExportedBinding } from "./shared.js";',
		'export async function result() {',
		'  const lazy = await import("./lazy.js");',
		'  return [aVeryLongSharedHelperName(2), anotherQuiteLongExportedBinding, lazy.lazyValue];',
		'}',
	].join('\n'),
	'/app/second.js':
		'import { aVeryLongSharedHelperName, thirdLongExportedName } from "./shared.js";\nexport function result() { return [aVeryLongSharedHelperName(1), thirdLongExportedName]; }',
	'/app/shared.js':
		'export function aVeryLongSharedHelperName(value) { return value * 21; }\nexport const anotherQuiteLongExportedBinding = String(Math.max(0, 1));\nexport const thirdLongExportedName = String(Math.min(2, 3));',
	'/app/lazy.js':
		'import { thirdLongExportedName } from "./shared.js";\nexport const lazyValue = "lazy" + thirdLongExportedName;',
};

test('packed builds shorten cross-chunk export names and still run', async () => {
	const chunks = await buildPacked(sources);
	expect(chunks.length).toBeGreaterThan(2);
	expect(await run(chunks)).toEqual([
		[42, '1', 'lazy2'],
		[21, '2'],
	]);
	const code = chunks.map((chunk) => chunk.code).join('\n');
	expect(code).not.toContain('aVeryLongSharedHelperName');
	expect(code).not.toContain('init_shared');
	expect(code).toContain('lazyValue');
	for (const chunk of chunks.filter((item) => item.isEntry))
		expect(chunk.code).toMatch(/export\s*\{\s*\w+ as result\s*\}/);
});

test('the plan rewrites both sides of a static import and keeps entry signatures', () => {
	const plan = planShortExportNames([
		{
			fileName: 'entry.js',
			code: 'import{longSharedName as e,other as t}from"./pack.js";console.log(e,t);export{e as publicName};',
			exports: ['publicName'],
			isEntry: true,
			signature: ['publicName'],
		},
		{
			fileName: 'pack.js',
			code: 'var n=1,r=2;export{n as longSharedName,r as other};',
			exports: ['longSharedName', 'other'],
		},
	]);
	const names = plan.renames.get('pack.js')!;
	expect([...names.keys()].sort()).toEqual(['longSharedName', 'other']);
	expect(plan.renames.has('entry.js')).toBe(false);
	for (const name of names.values()) expect(name.length).toBeLessThanOrEqual(3);
});

test('a namespace import or a star re-export leaves the target names alone', () => {
	for (const importer of [
		'import*as n from"./pack.js";console.log(n.longSharedName);',
		'export*from"./pack.js";',
	]) {
		const plan = planShortExportNames([
			{ fileName: 'entry.js', code: importer, exports: [], isEntry: true, signature: [] },
			{
				fileName: 'pack.js',
				code: 'var n=1;export{n as longSharedName};',
				exports: ['longSharedName'],
			},
		]);
		expect(plan.renames.size).toBe(0);
	}
});

test('a name read as a property or string anywhere keeps its spelling', () => {
	const plan = planShortExportNames([
		{
			fileName: 'entry.js',
			code: 'import{longSharedName as e}from"./pack.js";import("./pack.js").then(m=>use(m.otherName));',
			exports: [],
			isEntry: true,
			signature: [],
		},
		{
			fileName: 'pack.js',
			code: 'var n=1,r=2;export{n as longSharedName,r as otherName};',
			exports: ['longSharedName', 'otherName'],
		},
	]);
	expect([...plan.renames.get('pack.js')!.keys()]).toEqual(['longSharedName']);
});

test('adding an export renames at most the names whose short prefix it collides with', () => {
	const names = Array.from({ length: 400 }, (_, index) => `binding${index}$${index % 7}`);
	const before = shortNames(names);
	const after = shortNames([...names, 'aNewlyAddedExport']);
	const changed = names.filter((name) => before.get(name) !== after.get(name));
	expect(changed.length).toBeLessThanOrEqual(2);
	expect(new Set(after.values()).size).toBe(after.size);
	expect(shortNames([...names].reverse())).toEqual(before);
});

test('short names avoid reserved words and names the chunk keeps', () => {
	const taken = new Set(['ab']);
	for (const name of shortNames(['x', 'y', 'z'], taken).values()) {
		expect(taken.has(name)).toBe(false);
		expect(/^[A-Za-z_$][\w$]*$/.test(name)).toBe(true);
	}
});

const pack = {
	fileName: 'pack.js',
	code: 'var n=1,r=2;export{n as longSharedName,r as otherName};',
	exports: ['longSharedName', 'otherName'],
};
const planFor = (importer: string) =>
	planShortExportNames([
		{ fileName: 'entry.js', code: importer, exports: [], isEntry: true, signature: [] },
		pack,
	]).renames.get('pack.js');

test('a property read elsewhere pins a name only when an import() hands the chunk out', () => {
	expect(
		[
			...planFor(
				'import{longSharedName as e}from"./pack.js";console.log(e,{}.otherName);',
			)!.keys(),
		].sort(),
	).toEqual(['longSharedName', 'otherName']);
	for (const importer of [
		'import{longSharedName as e}from"./pack.js";import(`./pack.js`).then(m=>use(m,m.otherName));',
		'import{longSharedName as e}from"./pack.js";const url="./pack.js";console.log(url,{}.otherName);',
	])
		expect([...planFor(importer)!.keys()], importer).toEqual(['longSharedName']);
});

test('imports the packer writes itself do not hand the chunk out', () => {
	for (const load of [
		'__marklessPackLoad("./pack.js","$mlAb12",()=>import("./pack.js"))',
		'import("./pack.js").then(module=>module.$mlAb12())',
		'setTimeout(()=>{for(const pack of[import("./pack.js")])pack.catch(()=>{})})',
	])
		expect(
			[
				...planFor(
					`import{longSharedName as e}from"./pack.js";const later=()=>${load};console.log(e,{}.otherName);`,
				)!.keys(),
			].sort(),
			load,
		).toEqual(['longSharedName', 'otherName']);
});

test('Rolldown namespace reads through import().then are renamed with the export', () => {
	const importer =
		'const load=()=>import("./pack.js").then(m=>(m.longSharedName(),m.otherName));console.log({}.otherName);';
	const plan = planShortExportNames([
		{ fileName: 'entry.js', code: importer, exports: [], isEntry: true, signature: [] },
		pack,
	]);
	const names = plan.renames.get('pack.js')!;
	expect([...names.keys()].sort()).toEqual(['longSharedName', 'otherName']);
	let next = importer;
	for (const edit of [...plan.edits.get('entry.js')!].sort((a, b) => b.start - a.start))
		next = next.slice(0, edit.start) + edit.source + next.slice(edit.end);
	expect(next).toBe(
		`const load=()=>import("./pack.js").then(m=>(m.${names.get('longSharedName')}(),m.${names.get('otherName')}));console.log({}.otherName);`,
	);
});

test('an import() by absolute URL hands the chunk out too', () => {
	expect([
		...planFor(
			'import{longSharedName as e}from"./pack.js";const load=()=>import("/build/pack.js").then(m=>use(m));console.log({}.otherName);',
		)!.keys(),
	]).toEqual(['longSharedName']);
});

test('exports no surviving chunk imports leave the pack once facades collapse', () => {
	const packCode = 'var n=1,r=2,q=3;export{n as usedName,r as facadeOnlyName,q as publicName};';
	const plan = planShortExportNames([
		{
			fileName: 'entry.js',
			code: 'import{usedName as e}from"./pack.js";console.log(e);',
			exports: [],
			isEntry: true,
			signature: [],
		},
		{
			fileName: 'facade.js',
			code: 'import{facadeOnlyName as e,usedName as t}from"./pack.js";export{e as value,t as other};',
			exports: ['value', 'other'],
			isDynamicEntry: true,
			signature: ['value', 'other'],
			removed: true,
		},
		{
			fileName: 'pack.js',
			code: packCode,
			exports: ['usedName', 'facadeOnlyName', 'publicName'],
		},
	]);
	expect([...plan.pruned.get('pack.js')!].sort()).toEqual(['facadeOnlyName', 'publicName']);
	expect(plan.edits.has('facade.js')).toBe(false);
	const names = plan.renames.get('pack.js')!;
	const [clause] = plan.edits.get('pack.js')!;
	expect(clause!.source).toBe(`export{n as ${names.get('usedName')}};`);
	expect(plan.exports.get('pack.js')).toEqual([names.get('usedName')]);
});
