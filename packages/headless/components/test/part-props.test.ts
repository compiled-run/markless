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

// U-O remainder: `{...rest}` renders attributes only. A consumer event the part
// declares no handler for is dropped at the spread, and a consumer `el` handle
// never binds. Both are marked failing so the day forwarding lands, this file
// turns red and the expectation is read again.
test.fails('CSR: a consumer event the part has no handler for rides the spread', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const trigger = container.querySelector('[data-case="spread"] button') as HTMLButtonElement;
	const hovers = container.querySelector('[data-probe="hovers"]') as HTMLElement;

	trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
	await expect.poll(() => hovers.textContent).toBe('1');
});

test.fails('CSR: a consumer el handle on a part fills alongside the part own handle', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const tag = container.querySelector('[data-probe="consumer-tag"]') as HTMLElement;
	const probe = container.querySelector('[data-probe-handle]') as HTMLButtonElement;

	probe.click();
	await expect.poll(() => tag.textContent).toBe('BUTTON');
});
