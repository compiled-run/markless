import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * A widget part dispatches to the consumer's callback through its own widget
 * graph, not through a capture context the composing module built for it.
 *
 * A capture context reaches only a part the composing module BOUND, and it binds
 * one per component edge the module root composes directly. A part written
 * inside a page-local component is composed through that component's edge as
 * well, so no bound row names it and no capture context reaches it — a dispatch
 * that depended on one folded away with the state still moving and the consumer
 * never told.
 */
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

export function BoxRoot({ onChange, children }) @{
	const box = boxState();
	box.onChange = onChange;

	<div ui-checked={box.checked}>{children}</div>
}

export function BoxTrigger({ children }) @{
	const box = boxState();

	<button onClick={() => box.toggle()}>{children}</button>
}`;

const DEFINITION_ID = 'shared:src/box.tsrx#boxState';
const SLOT_NODE_ID = `${DEFINITION_ID}/slot:onChange`;

async function compileFamily() {
	return compileTsrxModule({ filename: 'src/box.tsrx', source: FAMILY_SOURCE, symbols: [] });
}

test('the part’s slot carries the widget’s own slot node beside the consumer claim', async () => {
	const family = await compileFamily();
	const trigger = family.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	);
	const slot = trigger?.captureSlots.find((candidate) =>
		candidate.routes.some((route) => route.kind === 'widget-callback-route'),
	);

	expect(slot?.routes.map((route) => route.kind)).toEqual([
		'widget-callback-route',
		'callback-slot-route',
	]);
	expect(slot?.routes.find((route) => route.kind === 'callback-slot-route')).toMatchObject({
		graphNodeId: SLOT_NODE_ID,
		rootComponentName: 'BoxRoot',
		rootPropName: 'onChange',
	});
});

test('the part’s emitted handler dispatches through the slot node, not a capture context', async () => {
	const family = await compileFamily();
	const handler = family.symbolModules.modules.find((module) => module.kind === 'event-handler');

	expect(handler?.source).toContain(`marklessInvokeCallbackSlot(context, "${SLOT_NODE_ID}", [`);
	// The fold that used to swallow the dispatch of any part no consumer bound.
	expect(handler?.source).not.toContain('context.capture ?');
});

test('a part projected through a page-local component still reaches the slot node', async () => {
	const family = await compileFamily();
	const trigger = family.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	);
	const app = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
	import { BoxRoot, BoxTrigger } from './box.tsrx';
	export function App() @{
		let seen = state('none');
		<main>
			<BoxRoot onChange={(next) => seen = 'first:' + next}><Panel /></BoxRoot>
			<output>{seen}</output>
		</main>
	}
	function Panel() @{
		<BoxTrigger>A</BoxTrigger>
	}`,
		symbols: [
			{
				id: 'imported:box:trigger:0',
				chunk: 'virtual:markless:symbol:box:1',
				exportName: 'boxTrigger',
				componentEdgeId: 'component-edge:2',
				claimKind: 'widget-callback',
				captureSymbol: trigger!,
			},
		],
	});

	// Nothing in this module encloses the part, so the composing module has no
	// prop to answer with — the emitted handler already asked the graph instead.
	const resolved = app.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.loaderSymbolId === 'imported:box:trigger:0',
	);
	expect(
		resolved?.captureSlots[0]?.routes.some(
			(route) => route.kind === 'callback-slot-route' && route.graphNodeId === SLOT_NODE_ID,
		),
	).toBe(true);
});
