import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE } from '../src/passes/symbol-modules.ts';

/**
 * A graph write inside a TIMER CALLBACK that is itself a write's value.
 *
 * `s.timer = setInterval(() => { s.count = s.count + 1; }, 50)` is two writes,
 * not one. The semantic walk stopped at the outer assignment and handed the
 * value to the read collector, so the tick's write was recorded nowhere; the
 * emission band then matched the tick's assignment TARGET against the recorded
 * read of the same text and emitted
 * `context.graph.read("state:s", ["count"]) = ...`. That module PARSES, so the
 * read-back check let it ship, and every tick threw
 * `ReferenceError: Invalid left-hand side in assignment` — which is what stopped
 * carousel autoplay from advancing.
 *
 * The tick's write goes through the graph now, so the DOM refreshes with it, and
 * a write this band still cannot lower leaves its target authored and fails the
 * compile rather than shipping invalid JavaScript.
 */

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Ticker.tsrx', source, symbols: [] });
}

function eventSymbolSources(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

test('a shared method that starts an interval lowers the tick write through the graph', async () => {
	const result = await compile(`
import { shared, state } from '@markless/core';

export const ticker = shared(
	() => {
		const t = state({ count: 0, timer: 0 });

		return {
			...t,
			start() {
				t.timer = window.setInterval(() => {
					t.count = t.count + 1;
				}, 50);
			},
		};
	},
	{ scope: 'widget' },
);

export function Panel() @{
	const t = ticker();
	<div>
		<button onClick={() => t.start()}>start</button>
		<span>{t.count}</span>
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.stateLowering.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const node = 'shared:src/Ticker.tsrx#ticker/state:t';
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining(
			`context.graph.write({ graphNodeId: "${node}", path: ["count"], value: context.graph.read("${node}", ["count"]) + 1 })`,
		),
	]);
	// The shape that used to ship: a graph read standing where an assignment
	// target belongs. It parses, so only an assertion on the bytes catches it.
	expect(eventSymbolSources(result)).toEqual([
		expect.not.stringContaining('context.graph.read("' + node + '", ["count"]) ='),
	]);
});

test('the tick write is recorded as its own write, beside the handle write', async () => {
	const result = await compile(`
import { state } from '@markless/core';

export function Panel() @{
	const t = state({ count: 0, timer: 0 });
	<div>
		<button onClick={() => { t.timer = window.setInterval(() => { t.count = t.count + 1; }, 50); }}>start</button>
		<span>{t.count}</span>
	</div>
}
`);

	expect(result.semanticGraph.stateWrites.map((write) => write.target)).toEqual([
		't.timer',
		't.count',
	]);
	expect(result.stateLowering.writes.map((write) => write.path.join('.'))).toEqual([
		'timer',
		'count',
	]);
});

test('a setTimeout callback in a write value lowers its write too', async () => {
	const result = await compile(`
import { state } from '@markless/core';

export function Panel() @{
	const t = state({ open: false, timer: 0 });
	<div>
		<button onClick={() => { t.timer = window.setTimeout(() => { t.open = true; }, 200); }}>later</button>
		<span>{t.open}</span>
	</div>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining(
			'context.graph.write({ graphNodeId: "state:t", path: ["open"], value: true })',
		),
	]);
});

test('an update expression inside a timer callback lowers as an update', async () => {
	const result = await compile(`
import { state } from '@markless/core';

export function Panel() @{
	const t = state({ count: 0, timer: 0 });
	<div>
		<button onClick={() => { t.timer = window.setInterval(() => { t.count++; }, 50); }}>start</button>
		<span>{t.count}</span>
	</div>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([expect.stringContaining('context.graph.update({')]);
});

test('a dynamic-path write inside a timer callback fails the compile instead of shipping', async () => {
	// `t.rows[t.at] = 1` is not a static graph path, so state lowering refuses it
	// and no record reaches emission. The emission band must then leave the
	// authored target standing — the shape the unresolved-reference guard sees —
	// rather than lowering it as a read into an illegal assignment.
	const result = await compile(`
import { state } from '@markless/core';

export function Panel() @{
	const t = state({ rows: [0], at: 0, timer: 0 });
	<div>
		<button onClick={() => { t.timer = window.setInterval(() => { t.rows[t.at] = 1; }, 50); }}>start</button>
		<span>{t.at}</span>
	</div>
}
`);

	expect(result.stateLowering.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_STATE_DYNAMIC_PATH_WRITE',
	);
	expect(result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
	expect(
		result.symbolModules.diagnostics.every((diagnostic) => diagnostic.severity === 'error'),
	).toBe(true);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining('t.rows[t.at] = 1'),
	]);
});

test('a write inside a computed() nested in a timer callback fails the compile', async () => {
	// A derive's body is the one place a write is banned rather than lowered, and
	// this descent does not own that ban, so it collects nothing there. Nothing
	// collected must still mean nothing shipped: the target stays authored and the
	// guard fails the build.
	const result = await compile(`
import { computed, state } from '@markless/core';

export function Panel() @{
	const t = state({ count: 0, timer: 0 });
	<div>
		<button onClick={() => { t.timer = window.setInterval(() => { const c = computed(() => { t.count = 1; return 2; }); }, 50); }}>start</button>
		<span>{t.count}</span>
	</div>
}
`);

	expect(result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
	expect(eventSymbolSources(result)).toEqual([expect.stringContaining('t.count = 1')]);
});

test('a timer callback that invokes a callback slot is emitted async', async () => {
	// The band turns a filled callback slot into `await context.capture.invoke(...)`.
	// The author's timer callback is not async, and in a module `await` outside an
	// async function is a reserved word — the emitted module was a SyntaxError, and
	// the read-back check did not catch it because it does not reparse in module
	// goal. This is the carousel's own `onChange?.(next)` inside `setInterval`.
	const result = await compile(`
import { shared, state } from '@markless/core';

export const ticker = shared(
	() => {
		const t = state({ count: 0, timer: 0 });

		return {
			...t,
			// literal function type: a callback slot is only recognised from the
			// written annotation
			onTick: undefined as ((count: number) => void) | undefined,
			start() {
				t.timer = window.setInterval(() => {
					t.count = t.count + 1;
					t.onTick?.(t.count);
				}, 20);
			},
		};
	},
	{ scope: 'widget' },
);

function Root({ onTick }) @{
	const t = ticker();
	t.onTick = onTick;
	<div>
		<button onClick={() => t.start()}>start</button>
		<span>{t.count}</span>
	</div>
}

export default function Page() @{
	let heard = state(-1);
	<section>
		<Root onTick={(count) => heard = count} />
		<output>{heard}</output>
	</section>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	const starter = eventSymbolSources(result).find((source) => source.includes('setInterval'));
	expect(starter).toContain('window.setInterval(async () => {');
	expect(starter).toContain('await (context.capture ? context.capture.invoke(');
});

test('a timer callback with no await is left synchronous', async () => {
	const result = await compile(`
import { state } from '@markless/core';

export function Panel() @{
	const t = state({ count: 0, timer: 0 });
	<div>
		<button onClick={() => { t.timer = window.setInterval(() => { t.count = t.count + 1; }, 50); }}>start</button>
		<span>{t.count}</span>
	</div>
}
`);

	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining('window.setInterval(() => {'),
	]);
});

test('a function-free write value keeps the bytes the value band gave it', async () => {
	const result = await compile(`
import { state } from '@markless/core';

export function Panel() @{
	const t = state({ count: 0 });
	<div>
		<button onClick={() => { t.count = t.count + 1; }}>bump</button>
		<span>{t.count}</span>
	</div>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining(
			'context.graph.write({ graphNodeId: "state:t", path: ["count"], value: context.graph.read("state:t", ["count"]) + 1 })',
		),
	]);
});
