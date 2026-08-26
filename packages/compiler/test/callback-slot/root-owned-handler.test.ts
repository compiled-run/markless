import { expect, test } from 'vitest';
import { compileTsrxModule, emitSymbolResolverModule } from '../../src/index.ts';

/**
 * A callback the widget root stores on its shared() instance
 * (`box.onChange = onChange`) has to be reachable from the root's OWN handler,
 * not only from another part's.
 *
 * Both handlers call the same dispatching method, and a call to a shared()
 * method is compiled by copying that method's body into the handler module, so
 * both copies carry the same capture slot. What differs is how the composing
 * module answers that slot: a part whose edge sits inside the root's edge is
 * answered by the root's prop directly, while the root's own edge encloses
 * nothing and is answered through the slot's graph node instead. That node is
 * spelled module-level and lives on the rendered widget's instance, so the
 * answer only arrives if the invoke is instance-qualified the way the symbol's
 * own reads already are.
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

export function BoxRoot({ checked = false, onChange, children }) @{
	const box = boxState();
	box.onChange = onChange;
	box.checked = checked;

	<div ui-checked={box.checked} onPointerdown={() => box.toggle()}>{children}</div>
}

export function BoxTrigger({ children }) @{
	const box = boxState();

	<button onClick={() => box.toggle()}>{children}</button>
}`;

const DEFINITION_ID = 'shared:src/box.tsrx#boxState';

async function compileFamily() {
	return compileTsrxModule({ filename: 'src/box.tsrx', source: FAMILY_SOURCE, symbols: [] });
}

type Family = Awaited<ReturnType<typeof compileFamily>>;
type Extracted = Family['captureAnalysis']['extractedSymbols'][number];

function handlers(family: Family): { readonly root: Extracted; readonly trigger: Extracted } {
	const extracted = family.captureAnalysis.extractedSymbols.filter(
		(symbol) => symbol.kind === 'event-handler',
	);
	// Source order: the root's own pointerdown, then the trigger's click.
	return { root: extracted[0]!, trigger: extracted[1]! };
}

async function compileApp(family: Family) {
	const { root, trigger } = handlers(family);
	return compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
	import { BoxRoot, BoxTrigger } from './box.tsrx';
	export function App() @{
		let seen = state('none');
		<main>
			<BoxRoot onChange={(next) => seen = 'first:' + next}><BoxTrigger>A</BoxTrigger></BoxRoot>
			<output>{seen}</output>
		</main>
	}`,
		symbols: [
			{
				id: 'imported:box:root:0',
				chunk: 'virtual:markless:symbol:box:0',
				exportName: 'boxRoot',
				componentEdgeId: 'component-edge:0',
				claimKind: 'widget-callback',
				captureSymbol: root,
			},
			{
				id: 'imported:box:trigger:0',
				chunk: 'virtual:markless:symbol:box:1',
				exportName: 'boxTrigger',
				componentEdgeId: 'component-edge:1',
				claimKind: 'widget-callback',
				captureSymbol: trigger,
			},
		],
	});
}

function slotIdOf(symbol: Extracted): string | undefined {
	return symbol.captureSlots.find((slot) =>
		slot.routes.some((route) => route.kind === 'widget-callback-route'),
	)?.id;
}

test('both handlers copy the method body in and capture the same callback slot', async () => {
	const family = await compileFamily();
	const { root, trigger } = handlers(family);

	expect(slotIdOf(root)).toBe(
		`capture-slot:widget-callback:${DEFINITION_ID}:onChange:${root.symbolId}`,
	);
	expect(slotIdOf(trigger)).toBe(
		`capture-slot:widget-callback:${DEFINITION_ID}:onChange:${trigger.symbolId}`,
	);

	const sources = family.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
	expect(sources).toHaveLength(2);
	for (const source of sources) {
		expect(source).toContain('context.graph.write(');
		expect(source).toContain('context.capture.invoke("capture-slot:widget-callback:');
		// Nothing of the factory-local instance survives the copy (the module id
		// spells `box.tsrx`, which is not a reference to it).
		expect(source).not.toMatch(/\bbox\.(?!tsrx)/);
	}
});

test('the root’s own handler is answered through the slot node, the part through the prop', async () => {
	const app = await compileApp(await compileFamily());
	const routeFor = (loaderSymbolId: string) =>
		app.captureAnalysis.extractedSymbols.find(
			(symbol) => symbol.loaderSymbolId === loaderSymbolId,
		)?.captureSlots[0]?.routes[0];

	// The part's edge sits inside the root's edge, so the root's prop answers it.
	expect(routeFor('imported:box:trigger:0')).toMatchObject({
		kind: 'callback-route',
		componentEdgeId: 'component-edge:1',
	});
	// The root's own edge encloses nothing, so the slot's graph node answers it.
	expect(routeFor('imported:box:root:0')).toMatchObject({
		kind: 'callback-slot-route',
		graphNodeId: `${DEFINITION_ID}/slot:onChange`,
		componentEdgeId: 'component-edge:0',
	});
});

test('the root’s bound row carries the instance path its slot node needs', async () => {
	const app = await compileApp(await compileFamily());
	const rootRow = app.boundSymbolResolver.rows.find(
		(row) => row.loaderSymbolId === 'imported:box:root:0',
	);

	expect(rootRow?.instancePath).toBe('c0:');
	expect(rootRow?.captureSlots[0]?.route.kind).toBe('callback-slot-route');
});

test('the emitted resolver invokes a slot route on the row’s own instance', async () => {
	const app = await compileApp(await compileFamily());
	const module = emitSymbolResolverModule({
		symbols: [
			{
				id: 'imported:box:root:0',
				chunk: 'virtual:markless:symbol:box:0',
				exportName: 'boxRoot',
			},
		],
		boundSymbols: app.boundSymbolResolver.rows,
	});

	// A module-level slot id read off the unscoped page graph finds nothing: the
	// node it names lives under the rendered widget's instance path, so the row
	// hands that path over with the invoke.
	expect(module).toContain(
		'marklessInvokeCallbackSlot(context, route.graphNodeId, args, bound.instancePath)',
	);
});

test('a page with no slot route imports neither the invoker nor the scope helper', async () => {
	const module = emitSymbolResolverModule({
		symbols: [
			{
				id: 'imported:box:trigger:0',
				chunk: 'virtual:markless:symbol:box:1',
				exportName: 'boxTrigger',
			},
		],
		boundSymbols: [
			{
				id: 'bound:symbol%3A1:component-edge%3A1',
				baseSymbolId: 'imported:box:trigger:0',
				componentEdgePath: ['component-edge:1'],
				ancestry: [
					{
						componentEdgeId: 'component-edge:1',
						branchScopeIds: [],
						keyedRepeatScopeIds: [],
					},
				],
				captureSlots: [
					{
						slotId: 'capture-slot:widget-callback:x:onChange:symbol:1',
						path: [],
						route: {
							kind: 'callback-route',
							componentEdgeId: 'component-edge:1',
							callbackSymbolId: 'symbol:0',
						},
					},
				],
			},
		],
	});

	expect(module).not.toContain('marklessInvokeCallbackSlot');
	expect(module).not.toContain('instance-scope');
});
