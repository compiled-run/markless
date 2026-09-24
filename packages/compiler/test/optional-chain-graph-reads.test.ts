import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

const filename = '/workspace/app/pages/Records.tsrx';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [], omitAuthoredSource: true });
	expect(result.symbolModules.diagnostics).toEqual([]);
	return result;
}

async function load(source: string) {
	const loaded = await import(
		'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
	);
	return Object.values(loaded)[0] as (context: unknown) => unknown;
}

function graphContext(cells: Record<string, unknown>, handles: Record<string, unknown> = {}) {
	const writes: unknown[] = [];
	return {
		writes,
		context: {
			graph: {
				read: (id: string, path: ReadonlyArray<string> = []) =>
					path.reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], cells[id]),
				write: (record: unknown) => writes.push(record),
			},
			getElementHandle: (id: string) => handles[id],
		},
	};
}

test('a handler reading state through an optional member reads the cell and keeps the short circuit', async () => {
	const result = await compile(`
import { state } from '@markless/core';
export function Records() @{
 let sort = state<{ key: string } | null>({ key: 'name' });
 let label = state('');
 <button onClick={() => { label = sort?.key ?? 'none'; }}>{label}</button>
}
`);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	const run = await load(handler.source);

	for (const [sort, expected] of [
		[{ key: 'score' }, 'score'],
		[null, 'none'],
	] as const) {
		const { context, writes } = graphContext({ 'state:sort': sort });
		run(context);
		expect(writes).toEqual([expect.objectContaining({ graphNodeId: 'state:label', value: expected })]);
	}
});

test('a handler reading an element handle through an optional member lowers the handle', async () => {
	const result = await compile(`
import { element, state } from '@markless/core';
export function Records() @{
 const nameInput = element<HTMLInputElement>();
 let draft = state('');
 <input el={nameInput} onInput={() => { draft = nameInput?.value ?? ''; }} />
 <p>{draft}</p>
}
`);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	const run = await load(handler.source);

	for (const [input, expected] of [
		[{ value: 'Ada' }, 'Ada'],
		[undefined, ''],
	] as const) {
		const { context, writes } = graphContext({}, { 'element:nameInput': input });
		run(context);
		expect(writes).toEqual([expect.objectContaining({ graphNodeId: 'state:draft', value: expected })]);
	}
});

test('a computed reading through an optional member or a non-null assertion depends on the cell it reaches', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
export function Records() @{
 let order = state<{ field: string } | null>({ field: 'name' });
 let rows = state([{ title: 'first' }]);
 const field = computed(() => order?.field ?? 'none');
 const first = computed(() => rows[0]!.title);
 <p>{field}</p>
 <p>{first}</p>
 <button onClick={() => { order = null; }}>Clear</button>
}
`);
	const bindings = result.semanticGraph.graphBindings;
	expect(bindings.find((binding) => binding.id === 'computed:field')?.dependencies).toEqual([
		expect.objectContaining({ graphNodeId: 'state:order', path: [] }),
	]);
	expect(bindings.find((binding) => binding.id === 'computed:first')?.dependencies).toEqual([
		expect.objectContaining({ graphNodeId: 'state:rows', path: ['0'] }),
	]);

	const derives = result.symbolModules.modules.filter(
		(module) => module.kind === 'sync-computed-derive',
	);
	const [field, first] = await Promise.all(derives.map((module) => load(module.source)));
	const cells = { 'state:order': null, 'state:rows': [{ title: 'second' }] };
	expect(field!(graphContext(cells).context)).toBe('none');
	expect(field!(graphContext({ ...cells, 'state:order': { field: 'score' } }).context)).toBe('score');
	expect(first!(graphContext(cells).context)).toBe('second');
});
