import { expect, test } from 'vitest';
import { compileTsrxModule, summarizeModuleFunctions } from '../src/index.ts';

// A handler that hands a state object to a function is decided by what that
// function does with it: a function the compiler can read that changes it in
// place has each change invalidated after the call; one that keeps it, hands it
// on to code nobody can read, or cannot be read at all fails the build.

const helpers = `
export function retitle(card: { title: string }, next: string) { card.title = next; }
export function append(list: string[], entry: string) { list.push(entry); }
export function setCount(rows: Array<{ key: string; count: number }>, key: string, count: number) {
	const hit = rows.find((row) => row.key === key);
	if (hit) hit.count = count;
}
export function caption(card: { title: string; notes: string[] }) { return card.title + card.notes.length; }
export function watch(card: { title: string }) { return { later: () => { card.title = 'late'; } }; }
export function forward(card: { title: string }) { vendorSave(card); }
export async function settle(card: { title: string }) { await Promise.resolve(); card.title = 'done'; }
declare function vendorSave(value: unknown): void;
const remembered = new WeakMap<object, unknown>();
export function remember(spec: object, card: { title: string }) { remembered.set(spec, card); }
export function rememberBoxed(spec: object, card: { title: string }) { const box = { card }; remembered.set(spec, box); }
let stamped: unknown;
export function stamp(card: { title: string }) { card.title = 'x'; stamped = card; }
export function stampAndSend(card: { title: string }) { card.title = 'y'; vendorSave(card); }
export function swapEnds(list: string[]) { const next = [...list]; const first = next[0]!; next[0] = next[next.length - 1]!; next[next.length - 1] = first; return next; }
export function idsOf(list: Array<{ id: number }>) { const ids = new Set(list.map((entry) => entry.id)); const byId = new Map([[0, list.length]]); return ids.size + byId.size; }
const onFirst = (lists: string[][], change: (items: string[]) => string[]) => lists.map((list, at) => (at === 0 ? change(list) : list));
export function eachFirst(lists: string[][], change: (items: string[]) => string[]) { return onFirst(lists, change); }
export const nested: Record<string, (lists: string[][]) => string[][]> = { rev: (lists) => onFirst(lists, (items) => [...items].reverse()) };
export const nestedKeep: Record<string, (lists: string[][]) => string[][]> = { hold: (lists) => onFirst(lists, (items) => { remembered.set({}, items); return items; }) };
export const pure: Record<string, (list: string[]) => string[]> = { rev: (list) => [...list].reverse(), drop: (list) => list.slice(1) };
export const keep: Record<string, (list: string[]) => string[]> = { rev: (list) => [...list].reverse(), hold: (list) => { remembered.set({}, list); return list; } };
export function tally(card: { title: string }) { const seen = new Map(); seen.set('c', card); return seen.size; }
`;

const summaries = {
	'./cards.ts': summarizeModuleFunctions({ filename: 'src/cards.ts', source: helpers })!,
	'card-kit': {},
};

async function compile(handlerBody: string) {
	return compileTsrxModule({
		filename: 'src/Board.tsrx',
		source: `import { state } from '@markless/core';
import { append, caption, forward, retitle, setCount, settle, stamp, stampAndSend, watch } from './cards.ts';
import { pack } from 'card-kit';

function local(card: { title: string }) { card.title = card.title.toUpperCase(); }

export function Board() @{
	let card = state({ title: 'a', notes: ['n'] });
	let rows = state([{ key: 'k', count: 0 }]);
	let picked = state('');
	<div>
		<output>{card.title}</output>
		<output>{rows[0].count}</output>
		<output>{picked}</output>
		<button onClick={() => { ${handlerBody} }}>go</button>
	</div>
}
`,
		symbols: [],
		importedFunctionSummaries: summaries,
	});
}

type Compiled = Awaited<ReturnType<typeof compile>>;

function errors(result: Compiled) {
	return [
		...result.semanticGraph.diagnostics,
		...result.stateLowering.diagnostics,
		...result.symbolModules.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
}

function handlerSource(result: Compiled): string {
	return result.symbolModules.modules.find((module) => module.kind === 'event-handler')!.source;
}

test('a module summary says which parameters a function changes, keeps or hands on', () => {
	expect(summaries['./cards.ts']).toMatchObject({
		retitle: {
			parameters: [{ mutates: [['title']], retains: [], unseen: [] }, expect.anything()],
		},
		append: { parameters: [{ mutates: [[]] }, { mutates: [], retains: [], unseen: [] }] },
		setCount: { parameters: [{ mutates: [null] }, expect.anything(), expect.anything()] },
		caption: { parameters: [{ mutates: [], retains: [], unseen: [] }] },
		watch: { parameters: [{ mutates: [], retains: [[]] }] },
		forward: { parameters: [{ unseen: [{ callee: 'vendorSave', path: [] }] }] },
		settle: { parameters: [{ mutates: [], retains: [[]] }] },
	});
});

test('a value put into a container that outlives the call is kept; one put into a container of the call is not', () => {
	const cards = summaries['./cards.ts'];
	expect(cards.remember!.parameters[1]!.retains).not.toEqual([]);
	expect(cards.rememberBoxed!.parameters[1]!.retains).not.toEqual([]);
	expect(cards.tally!.parameters[0]).toEqual({ mutates: [], retains: [], unseen: [] });
	expect(cards.swapEnds!.parameters[0]!.retains).toEqual([]);
	expect(cards.idsOf!.parameters[0]).toEqual({ mutates: [], retains: [], unseen: [] });
});

test('a helper that changes the state it is handed has each change invalidated after it returns', async () => {
	const result = await compile(
		`retitle(card, 'b'); append(card.notes, 'm'); setCount(rows, 'k', 2); local(card); picked = caption(card);`,
	);

	expect(errors(result)).toEqual([]);
	expect(
		result.stateLowering.writes
			.filter((write) => write.changedByCall)
			.map((write) => [write.source, write.graphNodeId, write.path]),
	).toEqual([
		["retitle(card, 'b')", 'state:card', ['title']],
		["append(card.notes, 'm')", 'state:card', ['notes']],
		["setCount(rows, 'k', 2)", 'state:rows', []],
		['local(card)', 'state:card', ['title']],
	]);
	expect(handlerSource(result)).toContain(
		`marklessAfterCall(retitle(context.graph.read("state:card"), 'b'), context.graph, { graphNodeId: "state:card", path: ["title"] })`,
	);
});

test('a change made through a row local found in state is invalidated where that row lives', async () => {
	const result = await compile(
		`const row = rows.find((r) => r.key === 'k'); if (row) setCount([row], 'k', 1); retitle(row as never, 'x');`,
	);

	expect(errors(result).map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining(
			'Cannot pass "[row]" to setCount() here: "[row]" holds state objects',
		),
	]);
	expect(handlerSource(result)).toContain(
		'marklessAfterCall(retitle(row, \'x\'), marklessWriteThrough(context, "state:rows", [], row, true), { graphNodeId: "state:rows", path: ["title"] })',
	);
});

test.each([
	['watch(card)', 'watch() keeps a reference to it after it returns'],
	['picked = String(watch(card))', 'watch() keeps a reference to it after it returns'],
	['stamp(card)', 'stamp() keeps a reference to it after it returns'],
	['stampAndSend(card)', 'stampAndSend() hands it on to vendorSave()'],
	['forward(card)', 'forward() hands it on to vendorSave()'],
	['settle(card)', 'settle() keeps a reference to it after it returns'],
	['pack(card)', 'Markless cannot see what pack() does with it'],
	[
		'window.structuredClone(card)',
		'Markless cannot see what window.structuredClone() does with it',
	],
])('%s fails the build naming what the function does', async (body, reason) => {
	const result = await compile(body);

	expect(errors(result)).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_PASSED_BY_REFERENCE',
			statePath: 'card',
			message: expect.stringContaining(reason),
		}),
	]);
});

test('reading state through pure built-ins, or handing over a primitive, is not a refusal', async () => {
	const result = await compile(
		`picked = JSON.stringify(card) + String(card.title) + Object.keys(card).join() + caption(card); pack(card.title); console.log(card, rows); const re = /a/; re.test(card as never); re.exec(card as never); /b/.test(card as never); document.body.setAttribute('data-card', card as never);`,
	);

	expect(errors(result)).toEqual([]);
});

test('a state declared with a primitive type from a value the compiler cannot read is handed over as a primitive', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Board.tsrx',
		source: `import { state } from '@markless/core';
import { pack } from 'card-kit';
import { initial } from './initial.ts';

export function Board() @{
	const start = initial();
	let title = state<string>(start.title);
	let count = state<number>(start.count);
	let card = state<{ title: string }>(start.card);
	<div>
		<button onClick={() => { pack({ title, count }); }}>{title}</button>
		<button onClick={() => { pack({ title, card }); }}>{count}</button>
	</div>
}
`,
		symbols: [],
		importedFunctionSummaries: summaries,
	});

	expect(errors(result).map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('Cannot pass "{ title, card }" to pack() here'),
	]);
});

test('a function picked from an exported table of functions is decided by every function in the table', async () => {
	const source = (table: string) => `import { state } from '@markless/core';
import { ${table} } from './cards.ts';

export function Board() @{
	let list = state(['a', 'b']);
	@for (const op of Object.keys(${table}); key op) { <button onClick={() => { list = ${table}[op]!(list); }}>{op}</button> }
}
`;
	const compileWith = (table: string) =>
		compileTsrxModule({
			filename: 'src/Board.tsrx',
			source: source(table),
			symbols: [],
			importedFunctionSummaries: summaries,
		});

	expect(errors(await compileWith('pure'))).toEqual([]);
	expect(errors(await compileWith('keep')).map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('keeps a reference to it after it returns'),
	]);
});

test('a value handed to a callback the caller wrote is decided by that callback', async () => {
	const source = (body: string, names: string) => `import { state } from '@markless/core';
import { ${names} } from './cards.ts';

export function Board() @{
	let lists = state([['a', 'b']]);
	<button onClick={() => { ${body} }}>{lists.length}</button>
}
`;
	const run = async (body: string, names: string) =>
		errors(
			await compileTsrxModule({
				filename: 'src/Board.tsrx',
				source: source(body, names),
				symbols: [],
				importedFunctionSummaries: summaries,
			}),
		).map((diagnostic) => diagnostic.message);

	expect(await run("lists = nested['rev']!(lists);", 'nested')).toEqual([]);
	expect(await run('lists = eachFirst(lists, (items) => items.slice(1));', 'eachFirst')).toEqual(
		[],
	);
	expect(await run("lists = nestedKeep['hold']!(lists);", 'nestedKeep')).toEqual([
		expect.stringContaining('keeps a reference to it after it returns'),
	]);
	expect(
		await run(
			'lists = eachFirst(lists, (items) => { stash(items); return items; });',
			'eachFirst',
		),
	).toEqual([expect.stringContaining('hands it on to stash()')]);
});

test('without summaries from the host, an imported function is a pending request and not a refusal', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Board.tsrx',
		source: `import { state } from '@markless/core';
import { retitle } from './cards.ts';

export function Board() @{
	let card = state({ title: 'a' });
	<button onClick={() => retitle(card, 'b')}>{card.title}</button>
}
`,
		symbols: [],
	});

	expect(errors(result)).toEqual([]);
	expect(result.semanticGraph.importedFunctionRequests).toEqual(['./cards.ts']);
});

test('a template read of a plain value its module changes is refused; a constant import is not', async () => {
	const module = summarizeModuleFunctions({
		filename: 'src/tally.ts',
		source: `export const tally = { hits: 0 };
export const LABEL = { text: 'Hits' };
export function hit() { tally.hits++; }
`,
	})!;
	expect(module.tally).toEqual({ parameters: [], changedByItsModule: true });
	expect(module.LABEL).toBeUndefined();

	const result = await compileTsrxModule({
		filename: 'src/Tally.tsrx',
		source: `import { LABEL, hit, tally } from './tally.ts';

export function Tally() @{
	<button onClick={() => hit()}>{LABEL.text} {tally.hits}</button>
}
`,
		symbols: [],
		importedFunctionSummaries: { './tally.ts': module },
	});

	expect(errors(result)).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_TEMPLATE_READS_CHANGING_IMPORT',
			statePath: 'tally.hits',
		}),
	]);
});

test('a write through what a function returned after it was handed state is refused', async () => {
	const result = await compile(
		`const found = local(card) ?? card; const echo = caption(card); found.title = 'x';`,
	);

	expect(errors(result).map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_STATE_LOCAL_WRITE_UNTRACKED',
	);
});
