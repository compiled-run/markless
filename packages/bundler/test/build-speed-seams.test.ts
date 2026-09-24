import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rolldown } from 'rolldown';
import { describe, expect, test } from 'vitest';
import {
	chunkDynamicImports,
	chunkLocalExportSpecifiers,
	clearParsedChunkCode,
} from '../src/build/chunk-ast.ts';
import { scanEmittedDynamicImports } from '../src/build/dynamic-import-scan.ts';
import { moduleSpecifiers } from '../src/hooks/transform-emit.ts';
import { factorRenderDataLiterals } from '../src/render-data-literals.ts';
import { marklessServer } from '../src/rolldown.ts';
import { serverSharedSourceRequest } from '../src/virtual-ids.ts';

describe('module-record readers answer without the chunk tree', () => {
	test('dynamic imports carry their literal specifier and whether they take options', () => {
		clearParsedChunkCode();
		const code =
			'const a=()=>import("./a.js");import ( /* c */ \'./b.js\' , );import(`./c.js`);import(name);import("./d.js",{with:{}});import(`./${x}`);';
		expect(
			chunkDynamicImports('chunk.js', code)!.map(({ start, end, specifier, plain }) => [
				code.slice(start, end),
				specifier,
				plain,
			]),
		).toEqual([
			['import("./a.js")', './a.js', true],
			["import ( /* c */ './b.js' , )", './b.js', true],
			['import(`./c.js`)', './c.js', true],
			['import(name)', undefined, true],
			['import("./d.js",{with:{}})', './d.js', false],
			['import(`./${x}`)', undefined, true],
		]);
	});

	test('hands a specifier it cannot read back to the tree', () => {
		expect(chunkDynamicImports('chunk.js', 'import("./a" + ".js");')).toBeUndefined();
		expect(chunkDynamicImports('chunk.js', 'import("./\\u0061.js");')).toBeUndefined();
		expect(chunkDynamicImports('chunk.js', 'import(')).toBeUndefined();
	});

	test('reads braced local exports and skips declarations and re-exports', () => {
		const code =
			'const a=1,b=2;export const c=3;export function f(){}export{a as x,b,a as "y-z"};export{q}from"./q.js";export*from"./r.js";';
		expect([...chunkLocalExportSpecifiers('chunk.js', code)!]).toEqual([
			['x', 'a'],
			['b', 'b'],
			['y-z', 'a'],
		]);
	});

	test('emitted dynamic-import scan resolves relative literals against the chunk', () => {
		expect(
			scanEmittedDynamicImports(
				'import("./x.js");import("../y.js");import("pkg");import("./x.js");',
				'build/nested/chunk.js',
			),
		).toEqual(['build/nested/x.js', 'build/y.js']);
	});

	test('module specifiers list imports and re-exports in statement order', () => {
		expect(
			moduleSpecifiers(
				'export * from "c";import a from "a";export const data={"import":"x"};export { b } from "b";import "d";',
			),
		).toEqual(['c', 'a', 'b', 'd']);
	});

	test('render-data literal factoring reads JSON records without a tree', () => {
		const shared = JSON.stringify({
			rows: Array.from({ length: 40 }, (_, index) => index),
			label: 'a "quoted" value',
		});
		const records = [
			`{"name":"A","state":${shared},"view":[]}`,
			`{"name":"B","state":${shared},"view":[],"extra":NaN}`,
			`{"name":"C","view":${shared}}`,
		];
		const factored = factorRenderDataLiterals(records, 'const marklessRenderLiteral0 = 1;');
		expect(factored.factories).toEqual([`function marklessRenderLiteral1(){return ${shared}}`]);
		expect(factored.records).toEqual([
			'{"name":"A","state":marklessRenderLiteral1(),"view":[]}',
			'{"name":"B","state":marklessRenderLiteral1(),"view":[],"extra":NaN}',
			'{"name":"C","view":marklessRenderLiteral1()}',
		]);
	});
});

describe('server copies of client-only source requests', () => {
	test('only client-shaping queries on a component source share the plain module', () => {
		expect(serverSharedSourceRequest('/a/App.tsrx?markless-render-data', 'server')).toBe(
			'/a/App.tsrx',
		);
		expect(
			serverSharedSourceRequest(
				'/a/App.tsrx?markless-symbols&markless-scalar-plans',
				'server',
			),
		).toBe('/a/App.tsrx');
		expect(
			serverSharedSourceRequest(
				'/a/App.tsrx?markless-render-data&markless-reached-from=route',
				'server',
			),
		).toBe('/a/App.tsrx');
		expect(serverSharedSourceRequest('/a/App.tsrx?markless-render-data', 'client')).toBe(
			undefined,
		);
		expect(serverSharedSourceRequest('/a/App.tsrx?markless-resume', 'server')).toBe(undefined);
		expect(serverSharedSourceRequest('/a/App.tsrx', 'server')).toBe(undefined);
		expect(serverSharedSourceRequest('/a/app.ts?markless-render-data', 'server')).toBe(
			undefined,
		);
	});

	test(
		'a server build ships one copy of a component its client-only variants re-export',
		{ timeout: 120_000 },
		async () => {
			const directory = await realpath(
				await mkdtemp(join(tmpdir(), 'markless-server-share-')),
			);
			const app = join(directory, 'Counter.tsrx');
			await writeFile(
				app,
				`import { state } from '@markless/core';
export function Counter() @{
	let count = state(0);
	<button onClick={() => count++}>{'distinctive-counter-label'}{count}</button>
}
`,
			);
			const labelCounts = async (entry: string) => {
				await writeFile(join(directory, 'entry.js'), entry);
				const build = await rolldown({
					input: join(directory, 'entry.js'),
					external: [/^@markless\//],
					plugins: [
						{
							name: 'query-source',
							resolveId(source, importer) {
								const [path, query] = source.split('?');
								return query && importer
									? `${join(importer, '..', path!)}?${query}`
									: null;
							},
							load(id) {
								return id.includes('?')
									? readFile(id.split('?')[0]!, 'utf8')
									: null;
							},
						},
						marklessServer({ rootDir: directory }),
					],
				});
				try {
					const { output } = await build.generate({ format: 'es' });
					// Label occurrences per module the chunk carries, keyed by whether the module id has a query.
					const counts = { plain: 0, variant: 0 };
					for (const item of output) {
						if (item.type !== 'chunk') continue;
						for (const [id, module] of Object.entries(item.modules)) {
							const labels =
								(module.code ?? '').split('distinctive-counter-label').length - 1;
							if (id.endsWith('Counter.tsrx')) counts.plain += labels;
							else if (id.includes('Counter.tsrx?')) counts.variant += labels;
						}
					}
					return counts;
				} finally {
					await build.close();
				}
			};
			try {
				const plain = await labelCounts(`export { Counter } from './Counter.tsrx';\n`);
				expect(plain.plain).toBeGreaterThan(0);
				const withVariants = await labelCounts(
					[
						`export { Counter } from './Counter.tsrx';`,
						`export const renderData = () => import('./Counter.tsrx?markless-render-data');`,
						`export const symbols = () => import('./Counter.tsrx?markless-symbols&markless-scalar-plans');`,
					].join('\n'),
				);
				expect(withVariants).toEqual(plain);
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		},
	);
});
