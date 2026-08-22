import { expect, test } from 'vitest';
import { compileTsrxModule, linkedImportedClaimKind } from '../src/index.ts';

// T075: the measured shape of the widget-callback escape. A family module (wcb)
// declares a callback slot; a SECOND family (grp) composes the wcb root and
// answers that slot with its own logic, while a sibling part of the second
// family composes the wcb part that dispatches through it. Nothing in the second
// module encloses that part, so the claim is consumed there with no answer.
const FAMILY_SOURCE = `import { shared, state } from '@markless/core';
export const wcb = shared(
	() => {
		const s = state({ label: '', on: false });
		return {
			...s,
			onChange: undefined as ((next: boolean) => void) | undefined,
			toggle() {
				const next = s.on === true ? false : true;
				s.on = next;
				s.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function WcbRoot({ label = '', onChange, children }) @{
	const s = wcb();
	s.onChange = onChange;
	s.label = label;

	<div data-wcb-root>{children}</div>
}

export function WcbTrigger() @{
	const s = wcb();

	<button onClick={() => s.toggle()}>{s.on}</button>
}`;

const MIDDLE_SOURCE = `import { shared, state } from '@markless/core';
import { WcbRoot, WcbTrigger } from './wcb.tsrx';
export const grp = shared(
	() => {
		const g = state({ name: '', count: 0 });
		return { ...g, record(next: boolean) { g.count = g.count + 1; } };
	},
	{ scope: 'widget' },
);
export function GrpRoot({ name, children }) @{
	const g = grp();
	g.name = name;

	<WcbRoot label={g.name} onChange={(next: boolean) => { g.record(next); }}>{children}</WcbRoot>
}
export function GrpTrigger() @{
	<WcbTrigger />
}
export function GrpCount() @{
	const g = grp();
	<output>{g.count}</output>
}`;

// The checklist's own shape: the composing family declares a callback slot of
// its OWN and its method dispatches through it, so the method body carries a
// widget-callback claim wherever it is inlined.
const DISPATCHING_MIDDLE_SOURCE = `import { shared, state } from '@markless/core';
import { WcbRoot, WcbTrigger } from './wcb.tsrx';
export const grp = shared(
	() => {
		const g = state({ name: '', count: 0 });
		return {
			...g,
			onChange: undefined as ((count: number) => void) | undefined,
			record(next: boolean) {
				g.count = g.count + 1;
				g.onChange?.(g.count);
			},
		};
	},
	{ scope: 'widget' },
);
export function GrpRoot({ name, onChange, children }) @{
	const g = grp();
	g.onChange = onChange;
	g.name = name;

	<WcbRoot label={g.name} onChange={(next: boolean) => { g.record(next); }}>{children}</WcbRoot>
}
export function GrpTrigger() @{
	<WcbTrigger />
}`;

async function compileFamily() {
	return compileTsrxModule({ filename: 'src/wcb.tsrx', source: FAMILY_SOURCE, symbols: [] });
}

async function bindInMiddleModule() {
	const family = await compileFamily();
	const handler = family.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const bare = await compileTsrxModule({
		filename: 'src/wcb-group.tsrx',
		source: MIDDLE_SOURCE,
		symbols: [],
	});
	const triggerEdge = bare.semanticGraph.componentEdges.find(
		(edge) => edge.childComponentName === 'WcbTrigger',
	)!;
	const middle = await compileTsrxModule({
		filename: 'src/wcb-group.tsrx',
		source: MIDDLE_SOURCE,
		symbols: [
			{
				id: 'imported:wcb:trigger:0',
				chunk: 'virtual:markless:symbol:wcb:0',
				exportName: 'wcbTrigger',
				componentEdgeId: triggerEdge.id,
				claimKind: 'widget-callback',
				captureSymbol: handler,
			},
		],
	});
	return { family, handler, bare, middle };
}

test('the family publishes the slot as a widget-callback claim', async () => {
	const { handler } = await bindInMiddleModule();

	expect(linkedImportedClaimKind(handler)).toBe('widget-callback');
	expect(
		handler.captureSlots.some((slot) =>
			slot.routes.some((route) => route.kind === 'widget-callback-route'),
		),
	).toBe(true);
});

// The answer the composing module DOES own: its root's edge carries the callback
// prop, and the module already plans a callback-prop symbol for it. What it does
// not own is which of its roots encloses the part at the consumer.
test('the composing module owns the callback the slot should reach', async () => {
	const { bare } = await bindInMiddleModule();
	const rootEdge = bare.semanticGraph.componentEdges.find(
		(edge) => edge.parentComponentName === 'GrpRoot',
	)!;

	expect(rootEdge.props.find((prop) => prop.name === 'onChange')?.kind).toBe('callback');
	expect(
		bare.symbolResolver.symbols.some(
			(symbol) => symbol.kind === 'callback-prop' && symbol.componentEdgeId === rootEdge.id,
		),
	).toBe(true);
});

// T075d: no edge in the composing module textually encloses the part, and only
// the consumer's nesting says which of this module's roots does. The route
// therefore names the slot's own graph node: the part's instance resolves that
// node onto the widget it belongs to, exactly as it resolves its other reads.
test('a part with no enclosing root in its own module routes the slot through the graph', async () => {
	const { family, middle } = await bindInMiddleModule();
	const definitionId = family.semanticGraph.sharedDefinitions[0]!.id;
	const bound = middle.captureAnalysis.extractedSymbols.find((symbol) => symbol.loaderSymbolId)!;

	expect(bound.captureSlots).toHaveLength(1);
	expect(bound.captureSlots[0]?.routes[0]).toMatchObject({
		kind: 'callback-slot-route',
		graphNodeId: `${definitionId}/slot:onChange`,
	});
	// Nothing is left for a consumer to resolve: the claim was consumed here.
	expect(linkedImportedClaimKind(bound)).toBeUndefined();
});

// T075f. A shared method is inlined into a callback prop for the same reason it
// is inlined into an event handler: the prop carries no runtime instance to call
// it on, so leaving the call standing emits a free `g` and the symbol throws
// `ReferenceError` the moment a slot route invokes it. What T075e was really
// protecting against is the CLAIM: a widget-callback route published from a
// callback prop travels to the consumer, and the part's own gesture then binds
// the wrong symbol. A callback prop is invoked by whatever composed its edge, so
// no consumer edge can ever answer its slot — the slot's own graph node does,
// and the route is resolved here rather than published.
test('a dispatching shared method inlined into a callback prop routes through its own slot node', async () => {
	const module = await compileTsrxModule({
		filename: 'src/wcb-group.tsrx',
		source: DISPATCHING_MIDDLE_SOURCE,
		symbols: [],
	});
	const definitionId = module.semanticGraph.sharedDefinitions[0]!.id;
	const callbackProp = module.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'callback-prop' && symbol.propName === 'onChange',
	)!;

	// The body is inlined, so no free shared-instance reference survives.
	expect(callbackProp.source).not.toContain('g.record(');
	expect(callbackProp.source).toContain('g.count = g.count + 1');

	const extracted = module.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.symbolId === callbackProp.id,
	)!;
	expect(
		extracted.captureSlots.some((slot) =>
			slot.routes.some((route) => route.kind === 'widget-callback-route'),
		),
	).toBe(false);
	expect(
		extracted.captureSlots.flatMap((slot) =>
			slot.routes.filter((route) => route.kind === 'callback-slot-route'),
		)[0],
	).toMatchObject({ graphNodeId: `${definitionId}/slot:onChange` });
	// Nothing about this symbol asks a consumer to bind it.
	expect(linkedImportedClaimKind(extracted)).toBeUndefined();

	// The emitted module dispatches through the graph node rather than through a
	// capture context a locally invoked symbol never receives.
	const emitted = module.symbolModules.modules.find(
		(candidate) => candidate.symbolId === callbackProp.id,
	)!;
	expect(emitted.source).toContain('marklessInvokeCallbackSlot(context, ');
	expect(emitted.source).toContain(`${definitionId}/slot:onChange`);
});
