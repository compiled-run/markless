/**
 * A whole-object write to a state cell — `s.own = rect` where the cell's seed is
 * a plain object — lowers to the same `context.graph.write` an array-valued cell
 * gets, with the cell's own name as the path's one segment, and readers of its
 * fields lower to a deeper `context.graph.read` under that same segment. The
 * runtime matches a shallower written path against a deeper read one, so those
 * two shapes together are what makes the write reach the field's readers.
 *
 * The variants are the ones a family actually writes: an annotated cell type, an
 * `undefined` seed, a written object carrying keys the seed lacks, a right side
 * built by an imported helper, and the write coming from a `shared()` method.
 * None of them may lower to something that leaves the write unowned by the graph.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/compile-module.ts';

const compile = (source: string) =>
	compileTsrxModule({
		filename: '/workspace/app/src/App.tsrx',
		source,
		symbols: [],
	});

type Compiled = Awaited<ReturnType<typeof compile>>;

const handlerModules = (result: Compiled) =>
	result.symbolModules.modules
		.filter((module) => !module.source.includes('marklessUpdateText'))
		.map((module) => module.source)
		.join('\n');

const errors = (result: Compiled) =>
	(result.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === 'error');

const page = (declaration: string, write: string, read: string) => `
import { computed, state } from '@markless/core';
import { movedRect } from './rect.ts';

interface Rect { x: number; y: number; width: number; height: number }

export function App() @{
	${declaration}
	const derived = computed(() => ${read});

	<div>
		<output data-derived>{derived}</output>
		<button onClick={() => { ${write} }}>go</button>
	</div>
}
`;

const cases: ReadonlyArray<{
	readonly name: string;
	readonly source: string;
	readonly writePath: string;
	readonly readPath: string;
}> = [
	{
		name: 'a plain object seed written whole',
		source: page(
			'const s = state({ own: { x: 0, y: 0, width: 0, height: 0 } });',
			's.own = { x: 5, y: 7, width: 1, height: 2 };',
			's.own.x',
		),
		writePath: 'path: ["own"]',
		readPath: '"state:s", ["own", "x"]',
	},
	{
		name: 'an annotated cell type',
		source: page(
			'const s: { own: Rect } = state({ own: { x: 0, y: 0, width: 0, height: 0 } });',
			's.own = { x: 5, y: 7, width: 1, height: 2 };',
			's.own.x',
		),
		writePath: 'path: ["own"]',
		readPath: '"state:s", ["own", "x"]',
	},
	{
		name: 'an undefined seed written whole',
		source: page(
			'const s = state({ own: undefined as Rect | undefined });',
			's.own = { x: 5, y: 7, width: 1, height: 2 };',
			's.own ? s.own.x : -1',
		),
		writePath: 'path: ["own"]',
		readPath: '"state:s", ["own", "x"]',
	},
	{
		name: 'a written object carrying keys the seed lacks',
		source: page(
			'const s = state({ own: { x: 0, y: 0 } });',
			's.own = { x: 5, y: 7, width: 1, height: 2 };',
			's.own.width',
		),
		writePath: 'path: ["own"]',
		readPath: '"state:s", ["own", "width"]',
	},
	{
		name: 'a right side built by an imported helper',
		source: page(
			'const s = state({ own: { x: 0, y: 0, width: 0, height: 0 } });',
			'const rect = movedRect(1, 2); s.own = rect;',
			's.own.x',
		),
		writePath: 'path: ["own"]',
		readPath: '"state:s", ["own", "x"]',
	},
	{
		name: 'an array seed written whole, as the control',
		source: page(
			'const s = state({ list: [1, 2] });',
			's.list = [1, 2, 3];',
			's.list.length',
		),
		writePath: 'path: ["list"]',
		readPath: '"state:s", ["list"',
	},
];

for (const entry of cases) {
	test(`${entry.name} lowers to a graph write the readers' paths reach`, async () => {
		const result = await compile(entry.source);
		expect(errors(result)).toEqual([]);

		const modules = handlerModules(result);
		expect(modules).toContain('context.graph.write');
		expect(modules).toContain(entry.writePath);
		expect(modules).toContain(`context.graph.read(${entry.readPath}`);
	});
}

test('a shared method writing the cell whole lowers to the same graph write', async () => {
	const result = await compile(`
import { computed, shared, state } from '@markless/core';

interface Rect { x: number; y: number }
interface BoxState { own: Rect }

export const boxState = shared(() => {
	const box: BoxState = state({ own: { x: 0, y: 0 } });
	return {
		...box,
		place(rect: Rect) {
			box.own = rect;
		},
	};
}, { scope: 'widget' });

export function BoxRoot() @{
	const box = boxState();
	const derived = computed(() => box.own.x + 100);

	<div>
		<output data-derived>{derived}</output>
		<button onClick={() => box.place({ x: 5, y: 7 })}>go</button>
	</div>
}
`);
	expect(errors(result)).toEqual([]);

	const modules = handlerModules(result);
	const node = 'shared:/workspace/app/src/App.tsrx#boxState/state:box';
	expect(modules).toContain(`context.graph.write({ graphNodeId: "${node}", path: ["own"]`);
	expect(modules).toContain(`context.graph.read("${node}", ["own", "x"]`);
});
