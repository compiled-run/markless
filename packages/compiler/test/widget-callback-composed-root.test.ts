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
