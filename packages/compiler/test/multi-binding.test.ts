import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// Owner ruling 2026-08-23 ("A plus the three, plus events"): one element can bind
// SEVERAL handles, and one event attribute can carry SEVERAL handlers. This file
// pins the lowering of both, and the refusals that stayed refusals.

const familyModule = `import { element, shared, state } from '@markless/core';
export const groupState = shared(() => {
	const group = state({ value: '' });
	const fieldEls = element<HTMLElement[]>();
	const labelEl = element<HTMLLabelElement>();
	return { ...group, fieldEls, labelEl };
}, { scope: 'widget' });
export const itemState = shared(() => {
	const fieldEl = element<HTMLInputElement>();
	return { fieldEl };
}, { scope: 'widget' });
export function Field({ children, ...rest }) @{
	const group = groupState();
	const item = itemState();
	<input {...rest} el={[item.fieldEl, group.fieldEls]} type="radio" />
}
`;

test('an array literal in el= binds every handle in the list on the one element', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Group.tsrx',
		source: `import { element, shared, state } from '@markless/core';
export const groupState = shared(() => {
	const group = state({ value: '' });
	const fieldEls = element<HTMLElement[]>();
	return { ...group, fieldEls };
}, { scope: 'widget' });
export const itemState = shared(() => {
	const fieldEl = element<HTMLInputElement>();
	return { fieldEl };
}, { scope: 'widget' });
export function Field() @{
	const group = groupState();
	const item = itemState();
	<input el={[item.fieldEl, group.fieldEls]} type="radio" />
}
`,
	});

	expect(graph.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
	// Two bindings, one host: each handle keeps its own declaration's name, and
	// the singular one is not converted into a member of the set beside it.
	expect(
		graph.elementHandleBindings.map((binding) => ({
			hostNodeId: binding.hostNodeId,
			handleName: binding.handleName,
		})),
	).toEqual([
		{ hostNodeId: 'h0', handleName: 'item.fieldEl' },
		{ hostNodeId: 'h0', handleName: 'group.fieldEls' },
	]);
});

test('a non-handle inside the el= list is refused by name, not swallowed', async () => {
	const source = `import { element, state } from '@markless/core';
export function Field() @{
	const menu = state({ open: false });
	const fieldEl = element<HTMLInputElement>();
	<input el={[fieldEl, menu]} />
}
`;
	const graph = await buildSemanticGraph({ filename: 'src/Field.tsrx', source });
	const refusals = graph.diagnostics.filter(
		(item) => item.code === 'MARKLESS_ELEMENT_HANDLE_REQUIRED',
	);

	expect(refusals).toHaveLength(1);
	// The span is the offending ENTRY, not the whole list: the author is told
	// which of the two things they wrote is not a handle.
	expect(refusals[0]?.primarySpan).toEqual(
		expect.objectContaining({ start: source.indexOf('menu]') }),
	);
	// One entry refused, one entry kept: the list is read entry by entry, so the
	// handle standing beside the mistake is still an ordinary binding.
	expect(graph.elementHandleBindings.map((binding) => binding.handleName)).toEqual([
		'fieldEl',
		'menu',
	]);
});

test('a plural handle bound twice on one element files one record per binding site', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Two.tsrx',
		source: `import { element } from '@markless/core';
export function Panel() @{
	const boxEls = element<HTMLDivElement[]>();
	const markEl = element<HTMLDivElement>();
	<section>
		<div el={[boxEls, markEl]}>one</div>
		<div el={boxEls}>two</div>
	</section>
}
`,
	});

	expect(graph.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
	expect(
		graph.elementHandleBindings.map((binding) => `${binding.hostNodeId}:${binding.handleName}`),
	).toEqual(['h1:boxEls', 'h1:markEl', 'h2:boxEls']);
});

test('a singular handle bound twice is still the duplicate refusal, list or not', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Dup.tsrx',
		source: `import { element } from '@markless/core';
export function Panel() @{
	const boxEl = element<HTMLDivElement>();
	const markEl = element<HTMLDivElement>();
	<section>
		<div el={[boxEl, markEl]}>one</div>
		<div el={boxEl}>two</div>
	</section>
}
`,
	});

	expect(
		graph.diagnostics
			.filter((item) => item.severity === 'error')
			.map((item) => item.code),
	).toEqual(['MARKLESS_ELEMENT_HANDLE_DUPLICATE']);
});

test('an event array lowers to one payload record carrying both symbols in authored order', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Toggle.tsrx',
		source: `import { state } from '@markless/core';
export function Toggle() @{
	let opens = state(0);
	let taps = state(0);

	<section>
		<button onClick={[() => { opens = opens + 1; }, () => { taps = taps + 1; }]}>Go</button>
		<output>{opens}/{taps}</output>
	</section>
}
`,
		symbols: [],
	});

	// ONE record: the runtime files one record per element and event name, so a
	// second record would replace the first and only the last handler would run.
	const clicks = (result.protocolView?.events ?? []).filter(
		(event) => event.eventName === 'click',
	);
	expect(clicks).toHaveLength(1);
	expect(clicks[0]?.symbolIds).toHaveLength(2);

	const sourceOf = (symbolId: string | undefined) =>
		result.symbolResolver.symbols.find((symbol) => symbol.id === symbolId)?.source;
	expect(sourceOf(clicks[0]?.symbolIds[0])).toContain('opens');
	expect(sourceOf(clicks[0]?.symbolIds[1])).toContain('taps');
});

test('each handler in an event array keeps its own sync policy analysis', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Form.tsrx',
		source: `import { state } from '@markless/core';
export function Form() @{
	let saves = state(0);

	<form>
		<button onClick={[(event) => { event.preventDefault(); }, () => { saves = saves + 1; }]}>Save</button>
		<output>{saves}</output>
	</form>
}
`,
		symbols: [],
	});
	const graph = result.semanticGraph;

	// The policy belongs to the handler that wrote it; the second handler, which
	// prevents nothing, carries none.
	expect(
		graph?.events
			.filter((event) => event.eventName === 'click')
			.map((event) => Boolean(event.syncPolicy)),
	).toEqual([true, false]);
});

test('a spread-carried handler becomes its own record on the part element, never a refusal', async () => {
	const [, consumer] = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/Parts.tsrx',
			source: `import { shared, state } from '@markless/core';
export const boxState = shared(() => {
	const box = state({ on: false });
	return { ...box, toggle() { box.on = !box.on; } };
}, { scope: 'widget' });
export function Trigger({ children, ...rest }) @{
	const box = boxState();
	<button {...rest} type="button" onClick={() => { box.toggle(); }}>{children}</button>
}
`,
			importSource: './Parts.tsrx',
		},
		{
			filename: 'src/App.tsrx',
			source: `import { state } from '@markless/core';
import { Trigger } from './Parts.tsrx';
export function App() @{
	let clicks = state(0);
	<main>
		<Trigger onClick={() => { clicks = clicks + 1; }}>Hi</Trigger>
		<output>{clicks}</output>
	</main>
}
`,
		},
	]);

	// Under the retired shadow refusal this was a build error: the part writes its
	// own onClick AND spreads. Now the consumer's handler is forwarded onto the
	// part's element as a record of its own, qualified with the edge prefix. The
	// two records meet on one element at resume, where the runtime merges them -
	// they cannot merge here, because the part's own record belongs to the OTHER
	// module's payload. multi-binding.test.ts in vitest-browser runs both.
	expect(
		(consumer?.semanticGraph?.diagnostics ?? []).filter((item) => item.severity === 'error'),
	).toEqual([]);
	const clicks = (consumer?.protocolView?.events ?? []).filter(
		(event) => event.eventName === 'click',
	);
	expect(clicks).toHaveLength(1);
	expect(clicks[0]?.hostNodeId).toBe('c0:h0');
	expect(consumer?.symbolResolver.symbols.map((symbol) => symbol.id)).toContain(
		clicks[0]?.symbolIds[0],
	);
});

test('a consumer el riding the spread registers alongside the part own list binding', async () => {
	const [, consumer] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/Parts.tsrx', source: familyModule, importSource: './Parts.tsrx' },
		{
			filename: 'src/App.tsrx',
			source: `import { element } from '@markless/core';
import { Field } from './Parts.tsrx';
export function App() @{
	const mineEl = element<HTMLInputElement>();
	<main>
		<Field el={mineEl} />
	</main>
}
`,
		},
	]);

	const handles = consumer?.protocolView?.elementHandles ?? [];
	// The consumer's handle is an ADDITIONAL record on the same host as the two
	// the part binds itself; nothing shadows anything.
	expect(handles.map((handle) => handle.name)).toContain('mineEl');
	expect(handles.filter((handle) => handle.name === 'mineEl')).toHaveLength(1);
});
