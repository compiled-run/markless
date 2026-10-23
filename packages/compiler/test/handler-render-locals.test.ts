import { stripTypeScriptTypes } from 'node:module';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * A handler runs in the browser as its own symbol, with no component body around it.
 * A body `const` it reads is recomputed there from its definition; a local that cannot
 * be recomputed fails the compile instead of emitting a reference to nothing.
 */
async function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/story.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		source,
	});
}

const webFns = new URL('../../web/src/fns/', import.meta.url).href;

async function load(source: string) {
	const resolved = source.replace(/"@markless\/web\/fns\/([\w-]+)"/g, (_, name: string) =>
		JSON.stringify(`${webFns}${name}.ts`),
	);
	const loaded = await import(
		'data:text/javascript;base64,' + Buffer.from(resolved).toString('base64')
	);
	return Object.values(loaded).find((value) => typeof value === 'function') as (
		context: unknown,
		...args: unknown[]
	) => unknown;
}

function recordingContext(props: Record<string, unknown>) {
	const writes: Array<{ graphNodeId: string; value: unknown }> = [];
	return {
		writes,
		context: {
			graph: {
				read: (graphNodeId: string, path: ReadonlyArray<string> = []) =>
					graphNodeId.startsWith('prop:')
						? path.reduce<unknown>(
								(value, key) => (value as Record<string, unknown>)?.[key],
								props,
							)
						: undefined,
				write: (write: { graphNodeId: string; value: unknown }) => {
					writes.push({ graphNodeId: write.graphNodeId, value: write.value });
				},
			},
		},
	};
}

const preamble = `import { state } from '@markless/core';
const TALES = [{ key: 'a', title: 'Ay' }, { key: 'b', title: 'Bee' }];
`;

test('an event handler reading a body-local const recomputes it from its definition', async () => {
	const result = await compile(`${preamble}
export function Tale({ taleKey }: { readonly taleKey: string }) @{
	const tale = TALES.find((candidate) => candidate.key === taleKey)!;
	const heading = tale.title;
	let said = state('');
	<div>
		<button onClick={() => (said = heading + ':' + tale.key)}>{tale.title}</button>
		<p>{said}</p>
	</div>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	expect(handler.source).not.toMatch(/\b(tale|heading)\b/);
	const { context, writes } = recordingContext({ taleKey: 'b' });
	await (
		await load(handler.source)
	)(context);
	expect(writes).toEqual([{ graphNodeId: 'state:said', value: 'Bee:b' }]);
});

test('a callback prop reading a body-local const recomputes it from its definition', async () => {
	const result = await compile(`${preamble}
function Chooser({ onChoose }: { readonly onChoose: (value: string) => void }) @{
	<button onClick={() => onChoose('!')}>choose</button>
}
export function Shelf({ taleKey }: { readonly taleKey: string }) @{
	const tale = TALES.find((candidate) => candidate.key === taleKey)!;
	let picked = state('');
	<>
		<Chooser onChoose={(mark) => (picked = tale.title + mark)} />
		<p>{picked}</p>
	</>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const callback = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'callback-prop',
	)!;
	expect(callback.source).not.toMatch(/\btale\b/);
	const module = result.symbolModules.modules.find(
		(candidate) => candidate.symbolId === callback.id,
	)!;
	expect(module.source).not.toMatch(/\btale\b/);
	const { context, writes } = recordingContext({ taleKey: 'a' });
	await (
		await load(module.source)
	)({ ...context, args: ['!'] });
	expect(writes).toEqual([{ graphNodeId: 'state:picked', value: 'Ay!' }]);
});

test('a row handler reads both its row item and a body-local const', async () => {
	const result = await compile(`${preamble}
export function Cast({ taleKey }: { readonly taleKey: string }) @{
	const tale = TALES.find((candidate) => candidate.key === taleKey)!;
	const people = state([{ id: 'p' }, { id: 'q' }]);
	let said = state('');
	<>
		<ul>
			@for (const person of people; key person.id) {
				<li><button onClick={() => (said = tale.title + person.id)}>{person.id}</button></li>
			}
		</ul>
		<p>{said}</p>
	</>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	expect(handler.source).not.toMatch(/\btale\b/);
	expect(handler.source).toContain('TALES');
});

test('a handler reading a body local with no recomputable definition fails the compile', async () => {
	for (const [declaration, handlerName] of [
		['let offset = start * 2;', 'onClick'],
		['const [offset] = [start];', 'onInput'],
	] as const) {
		const result = await compile(`import { state } from '@markless/core';
export function Dial({ start }: { readonly start: number }) @{
	${declaration}
	let ticks = state(0);
	<input ${handlerName}={() => (ticks = ticks + offset)} value={ticks} />
}
`);
		expect(result.semanticGraph.diagnostics).toEqual([
			expect.objectContaining({
				code: 'MARKLESS_HANDLER_READS_RENDER_LOCAL',
				severity: 'error',
				message: expect.stringContaining('`offset`'),
			}),
		]);
	}
});

test('a callback prop reading a body local with no recomputable definition fails the compile', async () => {
	const result = await compile(`import { state } from '@markless/core';
function Chooser({ onChoose }: { readonly onChoose: () => void }) @{
	<button onClick={() => onChoose()}>choose</button>
}
export function Shelf({ seed }: { readonly seed: number }) @{
	let bump = seed + 1;
	let total = state(0);
	<>
		<Chooser onChoose={() => (total = total + bump)} />
		<p>{total}</p>
	</>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_HANDLER_READS_RENDER_LOCAL',
			severity: 'error',
			message: expect.stringContaining('`onChoose`'),
		}),
	]);
});

// A function declaration in the body follows the rule an arrow `const` does.
test('a handler named by a body function declaration runs that function in the browser', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Tally() @{
	let said = state('');
	const suffix = '!';
	function shout(event: Event) {
		said = event.type + suffix;
	}
	<div>
		<button onClick={shout}>shout</button>
		<p>{said}</p>
	</div>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	expect(handler.source).not.toMatch(/\bsuffix\b/);
	const { context, writes } = recordingContext({});
	await (
		await load(handler.source)
	)({ ...context, event: { type: 'click' } });
	expect(writes).toEqual([{ graphNodeId: 'state:said', value: 'click!' }]);
});

// A handler calling a body function runs that function's definition, so the body needs no move.
function graphContext(cells: Record<string, unknown>, props: Record<string, unknown> = {}) {
	const values = new Map(Object.entries(cells).map(([name, value]) => [`state:${name}`, value]));
	return {
		values,
		context: {
			graph: {
				read: (graphNodeId: string, path: ReadonlyArray<string> = []) =>
					path.reduce<unknown>(
						(value, key) => (value as Record<string, unknown>)?.[key],
						graphNodeId.startsWith('prop:') ? props : values.get(graphNodeId),
					),
				write: (write: { graphNodeId: string; value: unknown }) => {
					values.set(write.graphNodeId, write.value);
				},
			},
		},
	};
}

async function runHandler(source: string, cells: Record<string, unknown>) {
	const result = await compile(source);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const handlers = result.symbolModules.modules.filter((module) => module.kind === 'event-handler');
	const { context, values } = graphContext(cells);
	for (const handler of handlers) await (await load(handler.source))(context);
	return { values, handlers };
}

test('a handler calling a body function runs it, whichever way the function is declared', async () => {
	for (const declaration of [
		'const bump = () => (ticks = ticks + step);',
		'const bump = function () { ticks = ticks + step; };',
		'function bump() { ticks = ticks + step; }',
	]) {
		const { values, handlers } = await runHandler(
			`import { state } from '@markless/core';
export function Dial() @{
	let ticks = state(1);
	const step = 2;
	${declaration}
	<button onClick={() => bump()}>{ticks}</button>
}
`,
			{ ticks: 1 },
		);
		expect(handlers[0]!.source).not.toMatch(/\bstep\b/);
		expect(values.get('state:ticks')).toBe(3);
	}
});

test('a body function called with arguments reads them, state and props', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Cart({ unit }: { readonly unit: number }) @{
	let total = state(10);
	let kind = state('');
	function add(count: number, label: string) {
		total = total + count * unit;
		kind = label;
	}
	<button onClick={(event) => add(3, event.type)}>{total} {kind}</button>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	const { context, values } = graphContext({ total: 10, kind: '' }, { unit: 5 });
	await (await load(handler.source))({ ...context, event: { type: 'click' } });
	expect(values.get('state:total')).toBe(25);
	expect(values.get('state:kind')).toBe('click');
});

test('a body function calling other body functions runs all of them', async () => {
	const { values } = await runHandler(
		`import { state } from '@markless/core';
export function Ledger() @{
	let entries = state(0);
	let last = state('');
	const note = (text: string) => { last = text; };
	function record(amount: number) {
		entries = entries + amount;
		note('recorded ' + amount);
	}
	function recordTwice(amount: number) {
		record(amount);
		record(amount);
	}
	<button onClick={() => recordTwice(4)}>{entries} {last}</button>
}
`,
		{ entries: 0, last: '' },
	);
	expect(values.get('state:entries')).toBe(8);
	expect(values.get('state:last')).toBe('recorded 4');
});

test('a recursive body function keeps calling itself', async () => {
	const { values } = await runHandler(
		`import { state } from '@markless/core';
export function Countdown() @{
	let ticks = state(0);
	function tick(times: number) {
		if (times === 0) return;
		ticks = ticks + 1;
		tick(times - 1);
	}
	<button onClick={() => tick(3)}>{ticks}</button>
}
`,
		{ ticks: 0 },
	);
	expect(values.get('state:ticks')).toBe(3);
});

test('a row handler passes its row item to a body function', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Picker() @{
	const fruits = state([{ id: 'pear' }, { id: 'fig' }]);
	let picked = state('');
	function pick(id: string) {
		picked = picked + id;
	}
	<>
		<ul>
			@for (const fruit of fruits; key fruit.id) {
				<li><button onClick={() => pick(fruit.id)}>{fruit.id}</button></li>
			}
		</ul>
		<p>{picked}</p>
	</>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	const { context, values } = graphContext({ picked: 'pear' });
	await (await load(handler.source))({ ...context, locals: { fruit: { id: 'fig' } } });
	expect(values.get('state:picked')).toBe('pearfig');
});

test('a body function reading a body local with no recomputable definition still fails the compile', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Dial({ start }: { readonly start: number }) @{
	let offset = start * 2;
	let ticks = state(0);
	function bump() { ticks = ticks + offset; }
	<button onClick={() => bump()}>{ticks}</button>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_HANDLER_READS_RENDER_LOCAL',
			message: expect.stringContaining('`offset`'),
		}),
	]);
});

test('a callback prop naming a typed body function runs it with the argument the child passes', async () => {
	for (const callback of ['pickLabel', '(label: string) => add(label.length)']) {
		const result = await compile(`import { state } from '@markless/core';
function Chooser({ onChoose }: { readonly onChoose: (label: string) => void }) @{
	<button onClick={() => onChoose('xy')}>choose</button>
}
export function Shop() @{
	let total = state(1);
	function add(count: number) { total = total + count; }
	function pickLabel(label: string) { add(label.length); }
	<>
		<Chooser onChoose={${callback}} />
		<p>{total}</p>
	</>
}
`);
		expect(result.semanticGraph.diagnostics).toEqual([]);
		expect(result.captureAnalysis.diagnostics).toEqual([]);
		const prop = result.symbolModules.modules.find((module) => module.kind === 'callback-prop')!;
		const { context, values } = graphContext({ total: 1 });
		// The bundler strips the parameter's type annotation, as it does for every symbol module.
		await (await load(stripTypeScriptTypes(prop.source)))({ ...context, args: ['abc'] });
		expect(values.get('state:total')).toBe(4);
	}
});

// A built-in value the capture plane can carry is rebuilt from its definition, like any body const.
test('a handler and a body function reading a body Map, Set or Date rebuild it', async () => {
	for (const [declaration, read] of [
		['const names = new Map([[1, "one"], [2, "two"]]);', 'names.get(2)'],
		['const names = new Set(["two"]);', '[...names][0]'],
		['const names = new Date(Date.UTC(2020, 0, 2));', '"tw" + "o".repeat(names.getUTCDate() - 1)'],
	]) {
		for (const handler of [`() => (said = ${read})`, `() => say()`]) {
			const { values } = await runHandler(
				`import { state } from '@markless/core';
export function Dial() @{
	let said = state('');
	${declaration}
	function say() { said = ${read}; }
	<button onClick={${handler}}>{said}</button>
}
`,
				{ said: '' },
			);
			expect(values.get('state:said')).toBe('two');
		}
	}
});

test('a computed reading a body Map rebuilds it', async () => {
	const result = await compile(`import { state, computed } from '@markless/core';
export function Dial() @{
	let ticks = state(1);
	const names = new Map([[1, 'one'], [2, 'two']]);
	const label = computed(() => names.get(ticks) ?? 'none');
	<button onClick={() => (ticks = ticks + 1)}>{label}</button>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const derive = result.symbolModules.modules.find((module) => module.kind === 'sync-computed-derive')!;
	const { context } = graphContext({ ticks: 2 });
	expect(await (await load(derive.source))(context)).toBe('two');
});

test('a handler reading a body value built by a constructor the browser cannot rebuild fails the compile, naming it', async () => {
	for (const declaration of [
		'const util = new tools.Registry();',
		'class Registry { set() {} }\n\tconst util = new Registry();',
	]) {
		const result = await compile(`import { state } from '@markless/core';
import * as tools from './tools.ts';
export function Dial() @{
	let ticks = state(0);
	${declaration}
	function bump() { util.set(); ticks = ticks + 1; }
	<>
		<button onClick={() => util.set()}>{ticks}</button>
		<button onClick={() => bump()}>{ticks}</button>
	</>
}
`);
		const errors = [...result.semanticGraph.diagnostics, ...result.captureAnalysis.diagnostics];
		expect(errors.length).toBeGreaterThan(0);
		for (const error of errors) {
			expect(error).toMatchObject({ code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED', severity: 'error' });
			expect(error.message).toContain('"util"');
		}
	}
});
