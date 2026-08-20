import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/part-props.tsrx';

afterEach(async () => {
	await cleanup();
});

// The part's own handler runs first and the consumer's runs after it, because
// that is the order `checkbox.trigger` writes in its own closure. Nothing here
// is merge order the compiler chose.
async function expectComposedHandlers(container: ParentNode) {
	const trigger = container.querySelector('[data-case="handler"] button') as HTMLButtonElement;
	const clicks = container.querySelector('[data-probe="clicks"]') as HTMLElement;
	const indicator = container.querySelector('[data-case="handler"] span') as HTMLElement;

	trigger.click();
	await expect.poll(() => indicator.textContent).toBe('Checked');
	await expect.poll(() => clicks.textContent).toBe('1');
}

async function expectBarePartStillToggles(container: ParentNode) {
	const trigger = container.querySelector('[data-case="bare"] button') as HTMLButtonElement;
	const indicator = container.querySelector('[data-case="bare"] span') as HTMLElement;

	trigger.click();
	await expect.poll(() => indicator.textContent).toBe('Checked');
}

test('CSR: a consumer handler composes with the part own handler', async () => {
	const screen = await render(App);
	await expectComposedHandlers(screen.container as HTMLElement);
});

test('SSR: a consumer handler composes with the part own handler after resume', async () => {
	const screen = await renderSSR(App);
	await expectComposedHandlers(screen.container);
});

test('CSR: an omitted consumer handler leaves the part working', async () => {
	const screen = await render(App);
	await expectBarePartStillToggles(screen.container as HTMLElement);
});

test('SSR: an omitted consumer handler leaves the part working after resume', async () => {
	const screen = await renderSSR(App);
	await expectBarePartStillToggles(screen.container);
});

// U-O: `{...rest}` forwards the consumer's function props. An event the part
// declares no handler for reaches the element it spreads onto, and an `el`
// handle fills alongside the part's own.
async function expectSpreadEventToFire(container: ParentNode) {
	const trigger = container.querySelector('[data-case="spread"] button') as HTMLButtonElement;
	const hovers = container.querySelector('[data-probe="hovers"]') as HTMLElement;

	trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
	await expect.poll(() => hovers.textContent).toBe('1');
}

test('CSR: a consumer event the part has no handler for rides the spread', async () => {
	const screen = await render(App);
	await expectSpreadEventToFire(screen.container as HTMLElement);
});

test('SSR: a consumer event the part has no handler for rides the spread after resume', async () => {
	const screen = await renderSSR(App);
	await expectSpreadEventToFire(screen.container);
});

// A part whose consumer passed nothing must gain nothing: the bare trigger is
// still the part's own two handlers, never a forwarded third.
test('CSR: a part given no consumer function props gains no records', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const bare = container.querySelector('[data-case="bare"] button') as HTMLButtonElement;
	const hovers = container.querySelector('[data-probe="hovers"]') as HTMLElement;

	bare.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
	await expect.poll(() => hovers.textContent).toBe('0');
});

async function expectConsumerHandleToReachTheElement(container: ParentNode) {
	const trigger = container.querySelector('[data-case="handle"] button') as HTMLButtonElement;
	const probe = container.querySelector('[data-probe-handle]') as HTMLButtonElement;

	probe.click();
	await expect.poll(() => document.activeElement === trigger).toBe(true);
}

test('CSR: a consumer el handle on a part fills alongside the part own handle', async () => {
	const screen = await render(App);
	await expectConsumerHandleToReachTheElement(screen.container as HTMLElement);
});

test('SSR: a consumer el handle on a part fills alongside the part own handle after resume', async () => {
	const screen = await renderSSR(App);
	await expectConsumerHandleToReachTheElement(screen.container);
});
