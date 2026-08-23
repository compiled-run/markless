/**
 * A method call on graph state has to keep its receiver.
 *
 * `otp.value.slice(0, n)` in a handler used to lower to
 * `context.graph.read(id, ["value", "slice"])(0, n)`: the read swallowed the
 * method name, so the emitted call invoked a detached `String.prototype.slice`
 * with `this === undefined` and threw at runtime. The read must land on the
 * receiver - `read(id, ["value"])` - with the method call left on the result.
 *
 * The mutating-collection forms (`push`, `splice`, `setTime`, ...) keep their
 * own lowering: those stay `context.graph.call({ ... })` writes so the graph
 * sees the mutation.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

const source = `import { state } from '@markless/core';
export function Field() @{
	const draft = state({ text: '  hi  ', value: 'abcdef' });
	const list = state([1]);
	let out = state('');
	<section>
		<button onClick={() => out = draft.text.trim()}>trim</button>
		<button onClick={() => out = draft.value.slice(0, 3)}>slice</button>
		<button onClick={() => list.push(2)}>push</button>
		<p>{out}</p>
	</section>
}`;

const compileField = async () => {
	const result = await compileTsrxModule({
		filename: 'src/Field.tsrx',
		source,
		symbols: [],
	});

	const moduleFor = (snippet: string): string => {
		const symbol = result.symbolResolver.symbols.find(
			(symbol) => symbol.kind === 'event-handler' && symbol.source.includes(snippet),
		);
		expect(symbol, snippet).toBeDefined();
		const module = result.symbolModules.modules.find((module) => module.symbolId === symbol?.id);
		expect(module, snippet).toBeDefined();
		return module?.source ?? '';
	};

	return { result, moduleFor };
};

test('a non-mutating method on graph state reads the receiver and calls the method on it', async () => {
	const { result, moduleFor } = await compileField();

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.stateLowering.diagnostics).toEqual([]);

	const trimModule = moduleFor('draft.text.trim');
	expect(trimModule).toContain('context.graph.read("state:draft", ["text"]).trim()');
	expect(trimModule).not.toContain('["text", "trim"]');

	const sliceModule = moduleFor('draft.value.slice');
	expect(sliceModule).toContain('context.graph.read("state:draft", ["value"]).slice(0, 3)');
	expect(sliceModule).not.toContain('["value", "slice"]');
});

test('the read a method call records is the receiver, not the whole callee chain', async () => {
	const { result } = await compileField();

	const sources = result.semanticGraph.stateReads.map((read) => read.source);
	expect(sources).toContain('draft.text');
	expect(sources).toContain('draft.value');
	expect(sources).not.toContain('draft.text.trim');
	expect(sources).not.toContain('draft.value.slice');
});

test('a mutating collection method still lowers to a graph call write', async () => {
	const { result, moduleFor } = await compileField();

	const pushModule = moduleFor('list.push');
	expect(pushModule).toContain('context.graph.call({');
	expect(pushModule).toContain('graphNodeId: "state:list"');
	expect(pushModule).toContain('method: "push"');
	expect(pushModule).toContain('args: [2]');

	expect(
		result.semanticGraph.stateWrites.some(
			(write) => write.operation === 'call' && write.method === 'push',
		),
	).toBe(true);
	expect(result.semanticGraph.stateReads.map((read) => read.source)).not.toContain('list.push');
});

test('a method on scalar graph state reads the whole cell', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Scalar.tsrx',
		source: `import { state } from '@markless/core';
export function Scalar() @{
	let code = state('abcdef');
	let out = state('');
	<section>
		<button onClick={() => out = code.slice(0, 3)}>cut</button>
		<p>{out}</p>
	</section>
}`,
		symbols: [],
	});

	const sources = result.semanticGraph.stateReads.map((read) => read.source);
	expect(sources).toContain('code');
	expect(sources).not.toContain('code.slice');

	const symbol = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'event-handler' && symbol.source.includes('code.slice'),
	);
	const module = result.symbolModules.modules.find((module) => module.symbolId === symbol?.id);
	expect(module?.source).toContain('context.graph.read("state:code").slice(0, 3)');
});

test('a callable the graph itself declares keeps its read at the member', async () => {
	// A callback slot and a shared method are the callable; the read has to stay
	// on the member so the slot and method paths keep matching it, and so the
	// unknown-member gate still fires on a member the definition never declared.
	const result = await compileTsrxModule({
		filename: 'src/Slot.tsrx',
		source: `import { shared, state } from '@markless/core';

export const box = shared(() => {
	const s = state({ checked: true });
	return {
		...s,
		onChange: undefined as ((checked: boolean) => void) | undefined,
		toggle() { s.checked = !s.checked; s.onChange?.(s.checked); },
	};
}, { scope: 'widget' });

export function Box({ onChange }) @{
	const s = box();
	s.onChange = onChange;

	<button type="button" ui-checked={s.checked} onClick={() => s.toggle()}>x</button>
}`,
		symbols: [],
	});

	const sources = result.semanticGraph.stateReads.map((read) => read.source);
	expect(sources).toContain('s.onChange');
	expect(sources).toContain('s.toggle');
	expect(
		result.stateLowering.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
});

test('writing graph state from a derive is still a banned-write diagnostic through a method call', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Banned.tsrx',
		source: `import { state, computed } from '@markless/core';
export function Banned() @{
	const list = state([1]);
	const total = computed(() => {
		list.push(2);
		return list.length;
	});
	<p>{total}</p>
}`,
		symbols: [],
	});

	expect(
		result.semanticGraph.diagnostics.some((diagnostic) =>
			diagnostic.message.toLowerCase().includes('computed'),
		),
	).toBe(true);
});
