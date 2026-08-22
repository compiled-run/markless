import { expect, test } from 'vitest';
import { compileTsrxModule, linkedImportedClaimKind } from '../src/index.ts';

// The family module: a widget-scoped shared() whose returned object declares a
// callback slot, a method that dispatches through it, and a root that fills it
// with its own prop.
const FAMILY_SOURCE = `import { shared, state } from '@markless/core';
export const boxState = shared(
	() => {
		const box = state({ checked: false });
		return {
			...box,
			onChange: undefined as ((next: boolean) => void) | undefined,
			toggle() {
				const next = box.checked === true ? false : true;
				box.checked = next;
				box.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function BoxRoot({ checked = false, onChange, children }) @{
	const box = boxState();
	box.onChange = onChange;
	box.checked = checked;

	<div ui-checked={box.checked}>{children}</div>
}

export function BoxTrigger({ children }) @{
	const box = boxState();

	<button onClick={() => box.toggle()}>{children}</button>
}`;

async function compileFamily(source = FAMILY_SOURCE) {
	return compileTsrxModule({ filename: 'src/box.tsrx', source, symbols: [] });
}

test('a function-typed placeholder on the returned object is a callback slot, not a value property', async () => {
	const family = await compileFamily();
	const definition = family.semanticGraph.sharedDefinitions[0]!;

	expect(
		definition.returnProperties?.find((property) => property.name === 'onChange'),
	).toMatchObject({ kind: 'callback-slot', name: 'onChange' });
	// It is not an authored state()/computed() binding, and the runtime instance
	// still exposes no such property: nothing reads the slot as a value.
	expect(family.semanticGraph.graphBindings.some((binding) => binding.id.endsWith('onChange'))).toBe(
		false,
	);
	expect(
		family.protocolState.sharedDefinitions?.[0]?.returnProperties?.some(
			(property) => property.name === 'onChange',
		) ?? false,
	).toBe(false);
});

// T075d: the slot IS a node of its definition, valued by the root that fills it,
// so a part's dispatch can reach the consumer's handler through the graph.
test('the slot is a graph node of the definition, declared unvalued', async () => {
	const family = await compileFamily();
	const definitionId = family.semanticGraph.sharedDefinitions[0]!.id;
	const slotGraphNodeId = `${definitionId}/slot:onChange`;

	expect(family.protocolState.sharedDefinitions?.[0]?.graphNodeIds).toContain(slotGraphNodeId);
	expect(family.protocolState.cells).toContainEqual({
		graphNodeId: slotGraphNodeId,
		name: 'onChange',
		valueKind: 'unknown',
	});
	// The value is planned as the root's own seed, read off the composing edge's
	// callbacks map rather than from any authored expression.
	expect(
		family.symbolResolver.symbols.find(
			(symbol) => symbol.kind === 'shared-seed' && symbol.graphNodeId === slotGraphNodeId,
		),
	).toMatchObject({ componentName: 'BoxRoot', callbackSlotPropName: 'onChange', path: [] });
});

// A module that declares a slot no component fills declares no node: nothing
// could value it, and an unbound slot is already its own refusal.
test('a definition whose root fills no slot declares no slot node', async () => {
	const family = await compileFamily(
		FAMILY_SOURCE.replace('\tbox.onChange = onChange;\n', '').replace(
			'box.onChange?.(next);',
			'',
		),
	);

	expect(family.semanticGraph.sharedCallbackBindings).toEqual([]);
	expect(JSON.stringify(family.protocolState)).not.toContain('slot:onChange');
});

test('the root binding and the factory invocation are collected as routing facts', async () => {
	const family = await compileFamily();

	expect(family.semanticGraph.sharedCallbackBindings).toEqual([
		expect.objectContaining({
			slotName: 'onChange',
			componentName: 'BoxRoot',
			propName: 'onChange',
		}),
	]);
	expect(family.semanticGraph.sharedCallbackInvocations).toEqual([
		expect.objectContaining({ slotName: 'onChange', calleeSource: 'box.onChange' }),
	]);
});

test('filling a callback slot emits no state lowering, so nothing seeds it at runtime', async () => {
	const family = await compileFamily();

	// The slot itself is never lowered. `onChange` as a plain prop read on the
	// root's own props cell is a different fact and still belongs.
	expect(family.stateLowering.writes.some((write) => write.source.includes('.onChange'))).toBe(
		false,
	);
	expect(family.stateLowering.reads.some((read) => read.source.includes('.onChange'))).toBe(false);
	expect(family.stateLowering.diagnostics).toEqual([]);
});

test('the dispatching handler carries a widget-callback capture slot', async () => {
	const family = await compileFamily();
	const handler = family.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const slot = handler.captureSlots.find((candidate) =>
		candidate.routes.some((route) => route.kind === 'widget-callback-route'),
	)!;

	expect(slot.propName).toBeUndefined();
	expect(slot.routes[0]).toMatchObject({
		kind: 'widget-callback-route',
		slotName: 'onChange',
		rootPropName: 'onChange',
		rootComponentName: 'BoxRoot',
	});
	// A slot with no propName is claimed as a widget callback, never prop-bound.
	expect(linkedImportedClaimKind(handler)).toBe('widget-callback');
});

test('the emitted handler writes the state before it dispatches to the consumer', async () => {
	const family = await compileFamily();
	const handler = family.symbolModules.modules.find((module) =>
		module.source.includes('capture.invoke'),
	)!;

	const write = handler.source.indexOf('graph.write');
	const invoke = handler.source.indexOf('capture.invoke');
	expect(write).toBeGreaterThanOrEqual(0);
	expect(invoke).toBeGreaterThan(write);
});

test('a composing module resolves the slot against the enclosing root, per instance', async () => {
	const family = await compileFamily();
	const handler = family.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const app = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
	import { BoxRoot, BoxTrigger } from './box.tsrx';
	export function App() @{
		let seen = state('none');
		<main>
			<BoxRoot onChange={(next) => seen = 'first:' + next}><BoxTrigger>A</BoxTrigger></BoxRoot>
			<BoxRoot onChange={(next) => seen = 'second:' + next}><BoxTrigger>B</BoxTrigger></BoxRoot>
			<output>{seen}</output>
		</main>
	}`,
		symbols: [
			{
				id: 'imported:box:trigger:0',
				chunk: 'virtual:markless:symbol:box:0',
				exportName: 'boxTrigger',
				componentEdgeId: 'component-edge:1',
				claimKind: 'widget-callback',
				captureSymbol: handler,
			},
			{
				id: 'imported:box:trigger:1',
				chunk: 'virtual:markless:symbol:box:0',
				exportName: 'boxTrigger',
				componentEdgeId: 'component-edge:3',
				claimKind: 'widget-callback',
				captureSymbol: handler,
			},
		],
	});

	const resolved = app.captureAnalysis.extractedSymbols
		.filter((symbol) => symbol.loaderSymbolId)
		.flatMap((symbol) => symbol.captureSlots.flatMap((slot) => slot.routes));

	// Two roots, two distinct consumer handlers: each trigger reaches its own.
	const callbackSymbolIds = resolved.flatMap((route) =>
		route.kind === 'callback-route' ? [route.callbackSymbolId] : [],
	);
	expect(callbackSymbolIds).toHaveLength(2);
	expect(new Set(callbackSymbolIds).size).toBe(2);
});

test('a widget-callback claim binds the slot alone and leaves the part its own captures', async () => {
	const family = await compileFamily();
	const handler = family.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const app = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { BoxRoot, BoxTrigger } from './box.tsrx';
	export function App() @{
		<main><BoxRoot><BoxTrigger>A</BoxTrigger></BoxRoot></main>
	}`,
		symbols: [
			{
				id: 'imported:box:trigger:0',
				chunk: 'virtual:markless:symbol:box:0',
				exportName: 'boxTrigger',
				componentEdgeId: 'component-edge:1',
				claimKind: 'widget-callback',
				captureSymbol: handler,
			},
		],
	});

	const bound = app.captureAnalysis.extractedSymbols.find((symbol) => symbol.loaderSymbolId)!;
	// Exactly the callback slot: the child's own graph reads stay the child's, so
	// nothing rebinds the reads that carry the trigger's own event record.
	expect(bound.captureSlots).toHaveLength(1);
	expect(bound.captureSlots[0]?.propName).toBeUndefined();
	// No root prop was passed, so the slot folds to a compiler-known undefined.
	expect(bound.captureSlots[0]?.routes[0]).toMatchObject({
		kind: 'compiler-known-constant',
		value: undefined,
	});
});

test('a callback slot filled from anything but a callback prop is a build error', async () => {
	const family = await compileFamily(
		FAMILY_SOURCE.replace('box.onChange = onChange;', 'box.onChange = () => {};'),
	);

	expect(
		family.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
	).toContain('MARKLESS_CALLBACK_SLOT_SOURCE_UNSUPPORTED');
});

test('invoking a slot no component fills is reported', async () => {
	const family = await compileFamily(FAMILY_SOURCE.replace('box.onChange = onChange;', ''));

	expect(
		family.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
	).toContain('MARKLESS_CALLBACK_SLOT_UNBOUND');
});
