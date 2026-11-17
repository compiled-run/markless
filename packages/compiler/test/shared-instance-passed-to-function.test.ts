import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A shared() instance whose definition returns exactly one state object is that
// object, so a function it is passed to changes it the way it changes state().

const helpers = `
export function bump(c: { hits: number; tag: string }) {
	c.hits = c.hits + 1;
}
`;

function errors(compiled: Parameters<typeof collectTsrxModuleDiagnostics>[0]) {
	return collectTsrxModuleDiagnostics(compiled).filter((item) => item.severity === 'error');
}

async function compilePage(definitionReturn: string, extra = '') {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/helpers.ts', source: helpers, importSource: './helpers.ts' },
		{
			filename: 'src/counter.tsrx',
			importSource: './counter.tsrx',
			source: `
import { shared, state } from '@markless/core';

export const counter = shared(() => {
	const tally = state({ hits: 0, tag: 'a' });
	${extra}
	return ${definitionReturn};
}, { scope: 'app' });
`,
		},
		{
			filename: 'src/page.tsrx',
			source: `
import { bump } from './helpers.ts';
import { counter } from './counter.tsrx';

export default function Page() @{
	const c = counter();
	<button data-bump onClick={() => bump(c)}>{c.hits}</button>
}
`,
		},
	]);
	return results.at(-1)!;
}

for (const [shape, returned] of [
	['a spread of the state', '{ ...tally }'],
	['the state itself', 'tally'],
] as const) {
	test(`an instance returning ${shape} is passed as that state`, async () => {
		const page = await compilePage(returned);

		expect(errors(page)).toEqual([]);
		const handler = page.symbolModules.modules.find((item) => item.kind === 'event-handler');
		expect(handler?.source).toContain(
			'bump(context.graph.read("shared:src/counter.tsrx#counter/state:tally"))',
		);
		// The call's change is marked on the node once it returns, as it is for state().
		expect(handler?.source).toContain(
			'[["shared:src/counter.tsrx#counter/state:tally", []]]',
		);
	});
}

// An instance with a method, or with fields of two nodes, has no one object to pass.
for (const [shape, returned, extra] of [
	['a method', '{ ...tally, reset() { tally.hits = 0; } }', ''],
	['a second node', '{ ...tally, ...other }', "const other = state({ more: 1 });"],
	['part of the state', '{ hits: tally.hits }', ''],
] as const) {
	test(`an instance returning ${shape} is still refused when passed whole`, async () => {
		const page = await compilePage(returned, extra);

		const refusal = errors(page).find(
			(item) => item.code === 'MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE',
		);
		expect(refusal?.message).toContain('"c" is a shared() instance');
		expect(refusal?.suggestions.map((item) => item.message).join('\n')).toContain(
			'return only one state object',
		);
	});
}

// A field of any instance is a path into one node, so a function given it marks that path changed.
test('a function given a field of an instance with methods marks the field changed', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/append.ts',
			importSource: './append.ts',
			source: `export function append(list: string[]) { list.push('x'); }`,
		},
		{
			filename: 'src/shelf.tsrx',
			importSource: './shelf.tsrx',
			source: `
import { shared, state } from '@markless/core';

export const shelf = shared(() => {
	const rack = state({ books: [] as string[] });
	return { ...rack, clear() { rack.books = []; } };
}, { scope: 'app' });
`,
		},
		{
			filename: 'src/library.tsrx',
			source: `
import { append } from './append.ts';
import { shelf } from './shelf.tsrx';

export default function Library() @{
	const s = shelf();
	<button onClick={() => append(s.books)}>{s.books.length}</button>
}
`,
		},
	]);

	const library = results.at(-1)!;
	expect(errors(library)).toEqual([]);
	const handler = library.symbolModules.modules.find((item) => item.kind === 'event-handler');
	expect(handler?.source).toContain('[["shared:src/shelf.tsrx#shelf/state:rack", ["books"]]]');
});

// A field that starts as a string, number or boolean cannot change in the callee, so nothing is marked.
test('a function given a field that starts as a primitive marks nothing changed', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/bar.tsrx',
			importSource: './bar.tsrx',
			source: `
import { shared, state } from '@markless/core';

export const bar = shared(() => {
	const cell = state({ timer: 0, delay: 40, label: 'menu' });
	return { ...cell, close() { cell.timer = 0; } };
}, { scope: 'app' });
`,
		},
		{
			filename: 'src/menu.tsrx',
			source: `
import { bar } from './bar.tsrx';

export default function Menu() @{
	const b = bar();
	<button
		onClick={() => {
			window.clearTimeout(b.timer);
			b.timer = window.setTimeout(() => {}, Math.max(b.delay, 10));
			console.log(['x'].includes(b.label));
		}}
	>{b.label}</button>
}
`,
		},
	]);

	const menu = results.at(-1)!;
	expect(errors(menu)).toEqual([]);
	const handler = menu.symbolModules.modules.find((item) => item.kind === 'event-handler');
	expect(handler?.source).toContain('clearTimeout(');
	expect(handler?.source).not.toContain('marklessChanged');
});
