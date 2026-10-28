import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown, type OutputChunk } from 'rolldown';
import { expect, test } from 'vitest';
import { lazyNamespaceObjects, mergedBareVarDeclarations } from '../src/build/pack-top-level.ts';
import { nativePackingPlugins } from '../src/build/native-packing.ts';

const apply = (code: string) => {
	let result = code;
	for (const edit of lazyNamespaceObjects('chunk.js', code).sort((a, b) => b.start - a.start))
		result = result.slice(0, edit.start) + edit.source + result.slice(edit.end);
	return result;
};

test('a same-pack namespace object is built on first read, once', () => {
	const code =
		'import { __exportAll } from "./runtime.js";\nvar lazy_exports = __exportAll({ value: () => value });\nvar value = 1;\nexport const load = () => Promise.resolve().then(() => lazy_exports);\nexport const again = () => ({ lazy_exports });';
	const next = apply(code);
	expect(next).not.toContain('var lazy_exports');
	expect(next).toContain(
		'function lazy_exports$namespace(){return lazy_exports$namespace.value||(lazy_exports$namespace.value=__exportAll({ value: () => value }))}',
	);
	expect(next).toContain('Promise.resolve().then(() => lazy_exports$namespace())');
	expect(next).toContain('({ lazy_exports:lazy_exports$namespace() })');
});

test('a namespace re-exported inside another namespace is read through its own getter', () => {
	const code =
		'import { __exportAll } from "./runtime.js";\nvar a_exports = __exportAll({ kind: () => kind });\nvar kind = "a";\nvar index_exports = __exportAll({ A: () => a_exports });\nexport const load = () => Object.values(index_exports);';
	const next = apply(code);
	expect(next).toContain(
		'function index_exports$namespace(){return index_exports$namespace.value||(index_exports$namespace.value=__exportAll({ A: () => a_exports$namespace() }))}',
	);
	expect(next).not.toMatch(/[^$\w]a_exports[^$]/);
	const values = new Function(
		'__exportAll',
		`${next.replace(/^import .*\n/, '').replace('export const load', 'const load')}\nreturn load();`,
	)((all: Record<string, () => unknown>) =>
		Object.defineProperties(
			{},
			Object.fromEntries(
				Object.entries(all).map(([key, get]) => [key, { get, enumerable: true }]),
			),
		),
	);
	expect(values.map((value: { kind: string }) => value.kind)).toEqual(['a']);
});

test('an exported, shadowed or reassigned namespace stays eager', () => {
	for (const tail of [
		'export { lazy_exports };',
		'function read(lazy_exports) { return lazy_exports; }',
		'const { lazy_exports: other } = {}; let lazy_exports2; ({ lazy_exports } = {});',
		'lazy_exports = null;',
	]) {
		const code = `import { __exportAll as all } from "./runtime.js";\nvar lazy_exports = all({ value: () => 1 });\nexport const load = () => lazy_exports;\n${tail}`;
		expect(apply(code), tail).toBe(code);
	}
});

test('packed output that reads a namespace through a same-pack import() still runs', async () => {
	const sources: Record<string, string> = {
		'/app/first.js':
			'export async function result() { const lazy = await import("./lazy.js"); const again = await import("./lazy.js"); return [lazy.lazyValue, lazy === again, Object.keys(lazy)]; }',
		'/app/second.js': 'export function result() { return "second"; }',
		'/app/lazy.js': 'export const lazyValue = "lazy" + String(Math.max(1, 2));',
	};
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
	const directory = await mkdtemp(join(tmpdir(), 'markless-lazy-namespaces-'));
	try {
		const { output } = await build.generate({ format: 'es', minify: true });
		const chunks = output.filter((item): item is OutputChunk => item.type === 'chunk');
		const first = chunks.find((chunk) => chunk.name === 'first')!;
		expect(first.code).toMatch(/function (\w+)\(\)\{return \1\.value\|\|(=|\(\1\.value=)/);
		for (const chunk of chunks) await writeFile(join(directory, chunk.fileName), chunk.code);
		const module = await import(pathToFileURL(join(directory, first.fileName)).href);
		expect(await module.result()).toEqual(['lazy2', true, ['lazyValue']]);
	} finally {
		await build.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('bare var lists merge into the first one; initialized declarations stay put', () => {
	const code = 'var a, b;\nfunction f() { a = 1; }\nvar c;\nvar d = 2;\nvar e;\nexport { f };';
	let next = code;
	for (const edit of mergedBareVarDeclarations('chunk.js', code).sort(
		(x, y) => y.start - x.start,
	))
		next = next.slice(0, edit.start) + edit.source + next.slice(edit.end);
	expect(next).toBe('var a,b,c,e;\nfunction f() { a = 1; }\n\nvar d = 2;\n\nexport { f };');
	expect(mergedBareVarDeclarations('chunk.js', 'var a;\nlet b;')).toEqual([]);
});

test('bare var lists merge the same whatever their spelling', () => {
	const merged = (code: string) =>
		mergedBareVarDeclarations('chunk.js', code)
			.filter((edit) => edit.source)
			.map((edit) => edit.source);
	expect(merged('var a\nvar b')).toEqual(['var a,b;']);
	expect(merged('var\n\ta ,\n\tb;var é;')).toEqual(['var a,b,é;']);
	expect(merged('var $a;function f(){var x = 1}var _b;')).toEqual(['var $a,_b;']);
	expect(merged('var a = 1;var b = 2;')).toEqual([]);
	expect(merged('var a = 1, b;var c;')).toEqual([]);
});
