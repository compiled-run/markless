import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ComponentSpreadPage from './callback-spread/component-spread.tsrx';
import RootRelayPage from './callback-spread/root-relay.tsrx';
import RootSpreadPage from './callback-spread/root-spread.tsrx';
import WholePropsPage from './callback-spread/whole-props.tsrx';

// A callback a component receives and hands on, by name or inside its props spread, reaches whatever it lands on.
afterEach(() => cleanup());

async function clickWrites(root: ParentNode, trigger: string, expected: string) {
	root.querySelector<HTMLElement>(trigger)!.click();
	await expect.poll(() => root.querySelector('[data-seen]')?.textContent).toBe(expected);
}

async function wholePropsPassOnClick(root: ParentNode) {
	await clickWrites(root, '[data-whole="two"]', 'whole:two');
	await clickWrites(root, '[data-whole="one"]', 'whole:one');
}

async function rootCallbackReachesWidget(root: ParentNode) {
	await clickWrites(root, '[data-toggle="two"]', 'toggle:two');
	await clickWrites(root, '[data-toggle="one"]', 'toggle:one');
	// An instance handed no callback still flips, and calls nobody else's.
	root.querySelector<HTMLElement>('[data-toggle="none"]')!.click();
	await expect
		.poll(() => root.querySelector('[data-toggle="none"]')?.getAttribute('aria-checked'))
		.toBe('true');
	expect(root.querySelector('[data-seen]')?.textContent).toBe('toggle:one');
}

async function componentSpreadCallsCallback(root: ParentNode) {
	await clickWrites(root, '[data-press="two"]', 'press:two');
	await clickWrites(root, '[data-press="one"]', 'press:one');
}

test('CSR: a whole-props spread passes onClick to the element', async () => {
	await wholePropsPassOnClick((await render(WholePropsPage)).container);
});

test('SSR: a whole-props spread passes onClick to the element', async () => {
	await wholePropsPassOnClick((await renderSSR(WholePropsPage)).container);
});

test('CSR: a callback spread through rest onto a @markless/ui root reaches the widget', async () => {
	await rootCallbackReachesWidget((await render(RootSpreadPage)).container);
});

test('SSR: a callback spread through rest onto a @markless/ui root reaches the widget', async () => {
	await rootCallbackReachesWidget((await renderSSR(RootSpreadPage)).container);
});

test('CSR: a received callback handed by name to a @markless/ui root reaches the widget', async () => {
	await rootCallbackReachesWidget((await render(RootRelayPage)).container);
});

test('SSR: a received callback handed by name to a @markless/ui root reaches the widget', async () => {
	await rootCallbackReachesWidget((await renderSSR(RootRelayPage)).container);
});

test('CSR: a callback spread through rest onto a component that calls it', async () => {
	await componentSpreadCallsCallback((await render(ComponentSpreadPage)).container);
});

test('SSR: a callback spread through rest onto a component that calls it', async () => {
	await componentSpreadCallsCallback((await renderSSR(ComponentSpreadPage)).container);
});
