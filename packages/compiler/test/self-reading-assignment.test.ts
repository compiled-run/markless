import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// An assignment whose value reads the state and path it replaces lowers to an update: the value the
// graph hands the updater stands in for that read, so a page still showing an earlier value can apply it there too.
async function handlerSource(body: string, handler: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/Panel.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		source: `import { state } from '@markless/core';
export default function Panel() @{
	${body}
	<div><button onClick={async (event) => { ${handler} }}>go</button></div>
}`,
	});
	expect(compiled.symbolModules.diagnostics).toEqual([]);
	const module = compiled.symbolModules.modules.find((candidate) => candidate.kind === 'event-handler');
	return module!.source;
}

// The handler run against a graph holding `cells`; `update` hands the updater the value at its path, as the runtime does.
async function run(source: string, cells: Record<string, unknown>) {
	const values = new Map(Object.entries(cells).map(([name, value]) => [`state:${name}`, value]));
	const at = (value: unknown, path: ReadonlyArray<string>) =>
		path.reduce<unknown>((current, key) => (current as Record<string, unknown>)?.[key], value);
	const put = (graphNodeId: string, path: ReadonlyArray<string>, value: unknown) => {
		if (path.length === 0) return void values.set(graphNodeId, value);
		const root = structuredClone(values.get(graphNodeId)) as Record<string, unknown>;
		let target = root;
		for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
		target[path.at(-1)!] = value;
		values.set(graphNodeId, root);
	};
	const graph = {
		read: (graphNodeId: string, path: ReadonlyArray<string> = []) => at(values.get(graphNodeId), path),
		write: (write: { graphNodeId: string; path?: ReadonlyArray<string>; value: unknown }) => {
			put(write.graphNodeId, write.path ?? [], write.value);
			return write.value;
		},
		update: (update: { graphNodeId: string; path?: ReadonlyArray<string>; update: (value: unknown) => unknown }) => {
			const next = update.update(at(values.get(update.graphNodeId), update.path ?? []));
			put(update.graphNodeId, update.path ?? [], next);
			return next;
		},
	};
	const webFns = new URL('../../web/src/fns/', import.meta.url).href;
	const resolved = source.replace(/"@markless\/web\/fns\/([\w-]+)"/g, (_, name: string) => JSON.stringify(`${webFns}${name}.ts`));
	const loaded = await import('data:text/javascript;base64,' + Buffer.from(resolved).toString('base64'));
	const handler = Object.values(loaded).find((value) => typeof value === 'function') as (context: unknown) => unknown;
	await handler({ graph, event: {} });
	return Object.fromEntries([...values].map(([id, value]) => [id.slice('state:'.length), value]));
}

const updates: Array<[string, string, string, Record<string, unknown>, Record<string, unknown>]> = [
	['a counter', 'let taps = state(0);', 'taps = taps + 1;', { taps: 2 }, { taps: 3 }],
	['a list spread', "let pending = state<string[]>([]);", "pending = [...pending, 'b'];", { pending: ['a'] }, { pending: ['a', 'b'] }],
	['a list filter', "let pending = state<string[]>([]);", "pending = pending.filter((each) => each !== 'a');", { pending: ['a', 'b'] }, { pending: ['b'] }],
	['a field from itself', 'let t = state({ count: 0, other: 5 });', 't.count = t.count + 1;', { t: { count: 1, other: 5 } }, { t: { count: 2, other: 5 } }],
	['a toggle', 'let menu = state({ open: false });', 'menu.open = !menu.open;', { menu: { open: false } }, { menu: { open: true } }],
	['an object spread', 'let flags = state<Record<string, boolean>>({});', 'flags = { ...flags, b: true };', { flags: { a: true } }, { flags: { a: true, b: true } }],
	['the state read twice', 'let n = state(0);', 'n = n * n + n;', { n: 3 }, { n: 12 }],
];
for (const [label, body, handler, before, after] of updates)
	test(`${label} reading the state it replaces lowers to an update with the same result`, async () => {
		const source = await handlerSource(body, handler);
		expect(source).toContain('context.graph.update({ graphNodeId');
		expect(source).not.toContain('context.graph.write({ graphNodeId');
		expect(await run(source, before)).toEqual(after);
	});

const writes: Array<[string, string, string, Record<string, unknown>, Record<string, unknown>]> = [
	['a value from another state', 'let total = state(0); let step = state(2);', 'total = step + 1;', { total: 0, step: 2 }, { total: 3, step: 2 }],
	['a field from another field', 'let t = state({ count: 0, other: 5 });', 't.count = t.other + 1;', { t: { count: 0, other: 5 } }, { t: { count: 6, other: 5 } }],
	['a field from the whole state', 'let t = state({ count: 0, other: 5 });', 't.count = Object.keys(t).length;', { t: { count: 0, other: 5 } }, { t: { count: 2, other: 5 } }],
	['a whole state from one field', 'let t = state({ count: 0, other: 5 });', 't = { count: t.other, other: 0 };', { t: { count: 0, other: 5 } }, { t: { count: 5, other: 0 } }],
	['a literal', 'let taps = state(0);', 'taps = 0;', { taps: 4 }, { taps: 0 }],
	['a value that awaits', "let items = state<string[]>([]);", "items = [...items, await Promise.resolve('b')];", { items: ['a'] }, { items: ['a', 'b'] }],
];
for (const [label, body, handler, before, after] of writes)
	test(`${label} stays a plain write`, async () => {
		const source = await handlerSource(body, handler);
		expect(source).not.toContain('context.graph.update({ graphNodeId');
		expect(await run(source, before)).toEqual(after);
	});
