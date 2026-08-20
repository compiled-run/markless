import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A part library: one component spreads its own props onto the element it
// renders, which is the only thing that makes a consumer prop forwardable.
const partsModule = `import { element, shared, state } from '@markless/core';
export const boxState = shared(() => {
	const box = state({ on: false });
	const triggerEl = element();
	return { ...box, triggerEl, toggle() { box.on = !box.on; } };
}, { scope: 'widget' });
export function Root({ children, ...rest }) @{
	const box = boxState();
	<div {...rest} ui-on={box.on}>{children}</div>
}
export function Trigger({ children, onClick, ...rest }) @{
	const box = boxState();
	<button {...rest} el={box.triggerEl} type="button" onClick={(event) => { box.toggle(); onClick?.(event); }}>{children}</button>
}
`;

// The same structural pattern with every name, element, prop and ordering
// changed: proof the join reads structure, not these fixtures.
const alternateModule = `import { element, shared, state } from '@markless/core';
export const panelState = shared(() => {
	const panel = state({ open: false });
	const knobEl = element();
	return { ...panel, knobEl, flip() { panel.open = !panel.open; } };
}, { scope: 'widget' });
export function Shell({ children, ...others }) @{
	const panel = panelState();
	<section {...others} ui-open={panel.open}>{children}</section>
}
export function Knob({ children, onKeyDown, ...others }) @{
	const panel = panelState();
	<a {...others} el={panel.knobEl} href="#x" onKeyDown={(event) => { panel.flip(); onKeyDown?.(event); }}>{children}</a>
}
`;

async function compileConsumer(parts: string, consumer: string) {
	const [, consumerResult] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/Parts.tsrx', source: parts, importSource: './Parts.tsrx' },
		{ filename: 'src/App.tsrx', source: consumer },
	]);
	return consumerResult!;
}

test('a consumer event prop the part never claims becomes a view record on the spread element', async () => {
	const result = await compileConsumer(
		partsModule,
		`import { state } from '@markless/core';
import { Root, Trigger } from './Parts.tsrx';
export function App() @{
	let hovers = state(0);
	<main>
		<Root><Trigger onMouseEnter={() => { hovers = hovers + 1; }}>Hi</Trigger></Root>
		<output>{hovers}</output>
	</main>
}
`,
	);

	const spreadHost = result.moduleGraphInterface.render.components;
	expect(spreadHost, 'the consumer module owns no spread of its own').toBeTruthy();
	expect(
		result.protocolView?.events.map((event) => ({
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
		})),
	).toEqual([{ hostNodeId: 'c1:h1', eventName: 'mouseenter' }]);
	// The record names a real, resolvable symbol rather than a placeholder.
	const [forwarded] = result.protocolView?.events ?? [];
	expect(
		result.symbolResolver.symbols.map((symbol) => symbol.id),
		'the forwarded record must name a symbol this module resolves',
	).toContain(forwarded?.symbolIds[0]);
	// Composition keeps a parent record only for a host the parent's view locates.
	expect(
		result.protocolView?.locators.map((locator) => locator.hostNodeId),
	).toContain('c1:h1');
});

test('a consumer el handle rides the spread alongside the part own handle', async () => {
	const result = await compileConsumer(
		partsModule,
		`import { element } from '@markless/core';
import { Root, Trigger } from './Parts.tsrx';
export function App() @{
	const mine = element();
	<main><Root><Trigger el={mine}>Hi</Trigger></Root></main>
}
`,
	);

	expect(result.protocolView?.elementHandles).toEqual([
		{ hostNodeId: 'c1:h1', handleId: 'element:mine', name: 'mine' },
	]);
});

test('a part given no consumer function props gains no forwarded records', async () => {
	const result = await compileConsumer(
		partsModule,
		`import { Root, Trigger } from './Parts.tsrx';
export function App() @{
	<main><Root><Trigger>Hi</Trigger></Root></main>
}
`,
	);

	expect(result.protocolView?.events).toEqual([]);
	expect(result.protocolView?.elementHandles).toEqual([]);
	expect(
		result.protocolView?.locators.filter((locator) => locator.hostNodeId.includes(':')),
	).toEqual([]);
});

test('a prop the part destructured or already writes itself never rides the spread', async () => {
	const result = await compileConsumer(
		partsModule,
		`import { element, state } from '@markless/core';
import { Root, Trigger } from './Parts.tsrx';
export function App() @{
	let clicks = state(0);
	<main><Root><Trigger onClick={() => { clicks = clicks + 1; }}>Hi</Trigger></Root><output>{clicks}</output></main>
}
`,
	);

	// `onClick` is both destructured by the part and written on the element, so
	// the part composes it; forwarding it again would double-fire it.
	expect(result.protocolView?.events).toEqual([]);
});

test('the join reads spread structure, not the names of one component family', async () => {
	const result = await compileConsumer(
		alternateModule,
		`import { element, state } from '@markless/core';
import { Shell, Knob } from './Parts.tsrx';
export function App() @{
	let seen = state(0);
	const spot = element();
	<article>
		<Shell><Knob onPointerDown={() => { seen = seen + 1; }} el={spot}>Go</Knob></Shell>
		<output>{seen}</output>
	</article>
}
`,
	);

	expect(
		result.protocolView?.events.map((event) => ({
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
		})),
	).toEqual([{ hostNodeId: 'c1:h1', eventName: 'pointerdown' }]);
	expect(result.protocolView?.elementHandles).toEqual([
		{ hostNodeId: 'c1:h1', handleId: 'element:spot', name: 'spot' },
	]);
});
