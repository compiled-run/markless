import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// An assignment whose value reads the state and path it replaces lowers to an update: the value the
// graph hands the updater stands in for that read, so a page still showing an earlier value can apply it there too.
async function handlerSource(body: string, handler: string, markup?: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/Panel.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		source: `import { state } from '@markless/core';
export default function Panel() @{
	${body}
	${markup ?? `<div><button onClick={async (event) => { ${handler} }}>go</button></div>`}
}`,
	});
	expect(compiled.symbolModules.diagnostics).toEqual([]);
	const module = compiled.symbolModules.modules.find((candidate) => candidate.kind === 'event-handler');
	return module!.source;
}

type Cells = Record<string, unknown>;
type Run = { values: Cells; shown: Cells; event: { calls: number } };

// The handler run against a graph holding `cells`. `update` hands the updater the value at its path and, as the
// runtime does for a state a page still shows earlier, runs it again on the shown value.
async function run(source: string, cells: Cells, options: { shown?: Cells; locals?: Cells } = {}): Promise<Run> {
	const values = new Map(Object.entries(cells).map(([name, value]) => [`state:${name}`, value]));
	const shown = new Map(Object.entries(options.shown ?? {}).map(([name, value]) => [`state:${name}`, value]));
	const at = (value: unknown, path: ReadonlyArray<string>) =>
		path.reduce<unknown>((current, key) => (current as Record<string, unknown>)?.[key], value);
	const put = (cells: Map<string, unknown>, graphNodeId: string, path: ReadonlyArray<string>, value: unknown) => {
		if (path.length === 0) return void cells.set(graphNodeId, value);
		const root = structuredClone(cells.get(graphNodeId)) as Record<string, unknown>;
		let target = root;
		for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
		target[path.at(-1)!] = value;
		cells.set(graphNodeId, root);
	};
	const graph = {
		read: (graphNodeId: string, path: ReadonlyArray<string> = []) => at(values.get(graphNodeId), path),
		write: (write: { graphNodeId: string; path?: ReadonlyArray<string>; value: unknown }) => {
			put(values, write.graphNodeId, write.path ?? [], write.value);
			if (shown.has(write.graphNodeId) && (write.path ?? []).length === 0) shown.delete(write.graphNodeId);
			else if (shown.has(write.graphNodeId)) put(shown, write.graphNodeId, write.path ?? [], write.value);
			return write.value;
		},
		update: (update: { graphNodeId: string; path?: ReadonlyArray<string>; update: (value: unknown) => unknown }) => {
			const path = update.path ?? [];
			const next = update.update(at(values.get(update.graphNodeId), path));
			put(values, update.graphNodeId, path, next);
			if (shown.has(update.graphNodeId))
				put(shown, update.graphNodeId, path, update.update(at(shown.get(update.graphNodeId), path)));
			return next;
		},
	};
	const event = {
		calls: 0,
		next() {
			return `id${++this.calls}`;
		},
		Counted: class {
			readonly id = `id${++event.calls}`;
		},
	};
	const webFns = new URL('../../web/src/fns/', import.meta.url).href;
	const resolved = source.replace(/"@markless\/web\/fns\/([\w-]+)"/g, (_, name: string) => JSON.stringify(`${webFns}${name}.ts`));
	const loaded = await import('data:text/javascript;base64,' + Buffer.from(resolved).toString('base64'));
	const handler = Object.values(loaded).find((value) => typeof value === 'function') as (context: unknown) => unknown;
	await handler({ graph, event, locals: options.locals });
	const named = (cells: Map<string, unknown>) =>
		Object.fromEntries([...cells].map(([id, value]) => [id.slice('state:'.length), value]));
	return { values: named(values), shown: named(shown), event };
}

type Case = {
	readonly label: string;
	readonly body: string;
	readonly handler: string;
	readonly before: Cells;
	readonly after: Cells;
	readonly shown?: Cells;
	readonly shownAfter?: Cells;
	readonly markup?: string;
	readonly locals?: Cells;
	readonly calls?: number;
};

const updates: ReadonlyArray<Case> = [
	{ label: 'a counter', body: 'let taps = state(0);', handler: 'taps = taps + 1;', before: { taps: 2 }, after: { taps: 3 }, shown: { taps: 0 }, shownAfter: { taps: 1 } },
	{ label: 'a list spread', body: 'let pending = state<string[]>([]);', handler: "pending = [...pending, 'b'];", before: { pending: ['a'] }, after: { pending: ['a', 'b'] }, shown: { pending: [] }, shownAfter: { pending: ['b'] } },
	{ label: 'a list spread with an outside value', body: 'let pending = state<string[]>([]);', handler: 'const id = event.next(); pending = [...pending, id];', before: { pending: ['a'] }, after: { pending: ['a', 'id1'] }, shown: { pending: [] }, shownAfter: { pending: ['id1'] }, calls: 1 },
	{ label: 'a list filter', body: 'let pending = state<string[]>([]);', handler: "pending = pending.filter((each) => each !== 'a');", before: { pending: ['a', 'b'] }, after: { pending: ['b'] }, shown: { pending: ['a', 'c'] }, shownAfter: { pending: ['c'] } },
	{ label: 'a filter then map on the list', body: 'let pending = state<string[]>([]);', handler: "pending = pending.filter((each) => each !== 'a').map((each) => each + '!');", before: { pending: ['a', 'b'] }, after: { pending: ['b!'] }, shown: { pending: ['c'] }, shownAfter: { pending: ['c!'] } },
	{ label: 'a field from itself', body: 'let t = state({ count: 0, other: 5 });', handler: 't.count = t.count + 1;', before: { t: { count: 1, other: 5 } }, after: { t: { count: 2, other: 5 } }, shown: { t: { count: 0, other: 5 } }, shownAfter: { t: { count: 1, other: 5 } } },
	{ label: 'a toggle', body: 'let menu = state({ open: false });', handler: 'menu.open = !menu.open;', before: { menu: { open: false } }, after: { menu: { open: true } }, shown: { menu: { open: true } }, shownAfter: { menu: { open: false } } },
	{ label: 'a toggle at a literal key', body: 'let flags = state<Record<string, boolean>>({});', handler: "flags['a'] = !flags['a'];", before: { flags: { a: false } }, after: { flags: { a: true } }, shown: { flags: { a: true } }, shownAfter: { flags: { a: false } } },
	{ label: 'an object spread', body: 'let flags = state<Record<string, boolean>>({});', handler: 'flags = { ...flags, b: true };', before: { flags: { a: true } }, after: { flags: { a: true, b: true } }, shown: { flags: {} }, shownAfter: { flags: { b: true } } },
	{ label: 'the state read twice', body: 'let n = state(0);', handler: 'n = n * n + n;', before: { n: 3 }, after: { n: 12 }, shown: { n: 1 }, shownAfter: { n: 2 } },
];
for (const { label, body, handler, before, after, shown, shownAfter, calls = 0 } of updates)
	test(`${label} reading the state it replaces lowers to an update that replays on a shown value`, async () => {
		const source = await handlerSource(body, handler);
		expect(source).toContain('context.graph.update({ graphNodeId');
		expect(source).not.toContain('context.graph.write({ graphNodeId');
		const result = await run(source, before, { shown });
		expect(result.values).toEqual(after);
		expect(result.shown).toEqual(shownAfter);
		expect(result.event.calls).toBe(calls);
	});

const rowList = 'let todos = state([{ id: "a", done: false, all: false, n: 0 }]);';
const writes: ReadonlyArray<Case> = [
	{ label: 'a value from another state', body: 'let total = state(0); let step = state(2);', handler: 'total = step + 1;', before: { total: 0, step: 2 }, after: { total: 3, step: 2 } },
	{ label: 'a field from another field', body: 'let t = state({ count: 0, other: 5 });', handler: 't.count = t.other + 1;', before: { t: { count: 0, other: 5 } }, after: { t: { count: 6, other: 5 } } },
	{ label: 'a field from the whole state', body: 'let t = state({ count: 0, other: 5 });', handler: 't.count = Object.keys(t).length;', before: { t: { count: 0, other: 5 } }, after: { t: { count: 2, other: 5 } } },
	{ label: 'a whole state from one field', body: 'let t = state({ count: 0, other: 5 });', handler: 't = { count: t.other, other: 0 };', before: { t: { count: 0, other: 5 } }, after: { t: { count: 5, other: 0 } } },
	{ label: 'a literal', body: 'let taps = state(0);', handler: 'taps = 0;', before: { taps: 4 }, after: { taps: 0 } },
	{ label: 'a value that awaits', body: 'let items = state<string[]>([]);', handler: "items = [...items, await Promise.resolve('b')];", before: { items: ['a'] }, after: { items: ['a', 'b'] } },
	{ label: 'a field from an optional read', body: 'let menu = state({ open: false });', handler: 'menu.open = !menu?.open;', before: { menu: { open: false } }, after: { menu: { open: true } } },
	{
		label: 'a row item field from the whole list',
		body: 'let todos = state([{ id: "a", done: true, all: false }, { id: "b", done: true, all: false }]);',
		handler: '',
		markup: '<ul>@for (const todo of todos; key todo.id) { <li><button onClick={() => { todo.all = todos.every((each) => each.done); }}>go</button></li> }</ul>',
		locals: { todo: { id: 'a' } },
		before: { todos: [{ id: 'a', done: true, all: false }, { id: 'b', done: true, all: false }] },
		after: { todos: [{ id: 'a', done: true, all: true }, { id: 'b', done: true, all: false }] },
	},
	{
		label: 'a row item field from the list',
		body: rowList,
		handler: '',
		markup: '<ul>@for (const todo of todos; key todo.id) { <li><button onClick={() => { todo.n = todos.length; }}>go</button></li> }</ul>',
		locals: { todo: { id: 'a' } },
		before: { todos: [{ id: 'a', done: false, all: false, n: 0 }] },
		after: { todos: [{ id: 'a', done: false, all: false, n: 1 }] },
	},
	{ label: 'a field written through a local from the same path of the state', body: 'let box = state({ n: 1, inner: { n: 5 } });', handler: 'const inner = box.inner; inner.n = box.n + 1;', before: { box: { n: 1, inner: { n: 5 } } }, after: { box: { n: 1, inner: { n: 2 } } } },
	{ label: 'a list spread with a call', body: 'let items = state<string[]>([]);', handler: 'items = [...items, event.next()];', before: { items: ['a'] }, after: { items: ['a', 'id1'] }, shown: { items: [] }, calls: 1 },
	{ label: 'a list spread with a new object', body: 'let items = state<unknown[]>([]);', handler: 'items = [...items, new event.Counted().id];', before: { items: [] }, after: { items: ['id1'] }, shown: { items: [] }, calls: 1 },
	{ label: 'a list filter whose callback calls', body: 'let items = state<string[]>([]);', handler: "items = items.filter((each) => each !== event.next());", before: { items: ['a', 'id2'] }, after: { items: ['a'] }, shown: { items: ['b'] }, calls: 2 },
	{ label: 'a global call over the state', body: 'let n = state(0);', handler: 'n = Math.max(n, 3);', before: { n: 1 }, after: { n: 3 } },
];
for (const { label, body, handler, markup, locals, before, after, shown, shownAfter, calls = 0 } of writes)
	test(`${label} stays a plain write`, async () => {
		const source = await handlerSource(body, handler, markup);
		expect(source).not.toContain('context.graph.update({ graphNodeId');
		expect(source).not.toMatch(/\.update\(\{ graphNodeId/);
		const result = await run(source, before, { shown, locals });
		expect(result.values).toEqual(after);
		expect(result.shown).toEqual(shownAfter ?? {});
		expect(result.event.calls).toBe(calls);
	});

test('a list holding a callback that reads the list stays a plain write, and the callback reads the live list', async () => {
	const source = await handlerSource('let cbs = state<Array<() => unknown>>([]);', 'cbs = [...cbs, () => cbs];');
	expect(source).not.toContain('context.graph.update({ graphNodeId');
	const { values } = await run(source, { cbs: [] });
	const stored = values.cbs as Array<() => unknown>;
	expect(stored).toHaveLength(1);
	expect(stored[0]!()).toBe(values.cbs);
});
