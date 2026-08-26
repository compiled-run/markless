import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

const INNER_SOURCE = `import { shared, state } from '@markless/core';
export const innerState = shared(
	() => {
		const inner = state({ checked: false });
		return {
			...inner,
			onChange: undefined as ((next: boolean) => void) | undefined,
			toggle() {
				const next = inner.checked === true ? false : true;
				inner.checked = next;
				inner.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function InnerRoot({ checked = false, onChange, children }) @{
	const inner = innerState();
	inner.onChange = onChange;
	inner.checked = checked;

	<div ui-checked={inner.checked} onPointerdown={() => inner.toggle()}>{children}</div>
}`;

const BOX_SOURCE = `import { shared, state } from '@markless/core';
import { InnerRoot } from './inner.tsrx';
export const boxState = shared(
	() => {
		const box = state({ checked: false });
		return {
			...box,
			onChange: undefined as ((next: boolean) => void) | undefined,
			setAll(isOn: boolean) {
				box.checked = isOn;
				box.onChange?.(isOn);
			},
		};
	},
	{ scope: 'widget' },
);

export function BoxRoot({ checked = false, onChange, children }) @{
	const box = boxState();
	box.onChange = onChange;
	box.checked = checked;

	<InnerRoot checked={box.checked} onChange={(next: boolean) => { box.setAll(next === true); }}>{children}</InnerRoot>
}`;

const APP_SOURCE = `import { state } from '@markless/core';
import { BoxRoot } from './box.tsrx';
export function App() @{
	let seen = state('none');
	<main>
		<BoxRoot onChange={(next: boolean) => seen = 'set:' + next}>A</BoxRoot>
		<button onClick={(event) => seen = 'raw:' + event}>reset</button>
		<output>{seen}</output>
	</main>
}`;

type Compiled = Awaited<ReturnType<typeof compileTsrxModule>>;
type Extracted = Compiled['captureAnalysis']['extractedSymbols'][number];

/** Every symbol whose body still dispatches to something a composer must answer. */
function unansweredDispatchers(compiled: Compiled): ReadonlyArray<Extracted> {
	return compiled.captureAnalysis.extractedSymbols.filter((symbol) =>
		symbol.captureSlots.some((slot) =>
			slot.routes.some(
				(route) =>
					route.kind === 'callback-slot-route' || route.kind === 'widget-callback-route',
			),
		),
	);
}

async function compileStack() {
	const inner = await compileTsrxModule({
		filename: 'src/inner.tsrx',
		source: INNER_SOURCE,
		symbols: [],
	});
	const box = await compileTsrxModule({
		filename: 'src/box.tsrx',
		source: BOX_SOURCE,
		symbols: unansweredDispatchers(inner).map((captureSymbol, index) => ({
			id: `imported:inner:${index}`,
			chunk: `virtual:markless:symbol:inner:${index}`,
			exportName: `inner_${index}`,
			componentEdgeId: 'component-edge:0',
			claimKind: 'widget-callback' as const,
			captureSymbol,
		})),
	});
	const app = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: APP_SOURCE,
		symbols: unansweredDispatchers(box).map((captureSymbol, index) => ({
			id: `imported:box:${index}`,
			chunk: `virtual:markless:symbol:box:${index}`,
			exportName: `box_${index}`,
			componentEdgeId: 'component-edge:0',
			claimKind: 'widget-callback' as const,
			captureSymbol,
		})),
	});
	return { inner, box, app };
}

function moduleSourceFor(compiled: Compiled, kind: string, needle: string): string {
	const found = compiled.symbolModules.modules.find(
		(module) => module.kind === kind && module.source.includes(needle),
	);
	expect(found, `no ${kind} module containing ${needle}`).toBeDefined();
	return found!.source;
}

test('the invoking side hands the dispatched value over as an argument vector', async () => {
	const { inner, box } = await compileStack();

	expect(moduleSourceFor(inner, 'event-handler', 'marklessInvokeCallbackSlot')).toContain(
		'/slot:onChange", [next])',
	);
	expect(moduleSourceFor(box, 'callback-prop', 'marklessInvokeCallbackSlot')).toContain(
		'/slot:onChange", [isOn])',
	);
});

test('a root that answers a composed child’s slot binds the dispatched argument', async () => {
	const { box } = await compileStack();
	const rootArrow = moduleSourceFor(box, 'callback-prop', 'marklessInvokeCallbackSlot');

	expect(rootArrow).toContain('context.args');
});

test('a DOM handler binds its parameter to the event', async () => {
	const { app } = await compileStack();

	expect(moduleSourceFor(app, 'event-handler', "'raw:'")).toContain(
		'const event = context.event;',
	);
});

// The page's callback answers a slot the widget dispatches through. Nothing in
// the page's own module says so, so the value has to arrive as the dispatched
// argument vector; binding the DOM event instead hands the page the click.
test('a consumer callback binds the argument the slot invoke passed', async () => {
	const { app } = await compileStack();
	const consumer = moduleSourceFor(app, 'callback-prop', "'set:'");

	expect(consumer).toContain('context.args');
	expect(consumer).not.toContain('const next: boolean = context.event;');
});
