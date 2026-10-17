import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './cib-page.tsrx';
import RelayPage from './cib-relay-page.tsrx';
import SharedPage from './cib-shared-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;

async function pinWholeBodyRuns() {
	document
		.querySelector('[data-trigger="one"]')!
		.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
	await expect.poll(() => text('[data-calls]')).toBe('1');
	await expect.poll(() => text('[data-open="one"]')).toBe('open');
	await expect.poll(() => text('[data-after="one"]')).toBe('1');
}

test('CSR: a handler that calls a callback prop runs the rest of its body', async () => {
	await render(Page);
	await pinWholeBodyRuns();
});

test('SSR: a handler that calls a callback prop runs the rest of its body', async () => {
	await renderSSR(Page);
	await pinWholeBodyRuns();
});

async function pinRelayCallsOwnProp() {
	const press = (label: string) =>
		document
			.querySelector(`[data-trigger="${label}"]`)!
			.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
	press('r2');
	await expect.poll(() => text('[data-presses="r2"]')).toBe('1');
	await expect.poll(() => text('[data-picked]')).toBe('10');
	await expect.poll(() => text('[data-after="r2"]')).toBe('1');
	press('r1');
	await expect.poll(() => text('[data-presses="r1"]')).toBe('1');
	await expect.poll(() => text('[data-picked]')).toBe('11');
}

test('CSR: a callback passed down calls its own component callback prop', async () => {
	await render(RelayPage);
	await pinRelayCallsOwnProp();
});

test('SSR: a callback passed down calls its own component callback prop', async () => {
	await renderSSR(RelayPage);
	await pinRelayCallsOwnProp();
});

async function pinSharedBodyRuns() {
	const press = (slot: number) =>
		document
			.querySelector(`[data-shared-trigger="${slot}"]`)!
			.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
			);
	press(2);
	await expect.poll(() => text('[data-shared-calls]')).toBe('10');
	await expect.poll(() => text('[data-shared-at]')).toBe('-2');
	await expect
		.poll(() =>
			document.querySelector('[data-shared-trigger="2"]')!.getAttribute('aria-expanded'),
		)
		.toBe('true');
	press(1);
	await expect.poll(() => text('[data-shared-calls]')).toBe('11');
	await expect.poll(() => text('[data-shared-at]')).toBe('-1');
	await expect
		.poll(() =>
			document.querySelector('[data-shared-trigger="1"]')!.getAttribute('aria-expanded'),
		)
		.toBe('true');
}

test('CSR: a guarded handler writing shared cells around a callback prop call runs whole', async () => {
	await render(SharedPage);
	await pinSharedBodyRuns();
});

test('SSR: a guarded handler writing shared cells around a callback prop call runs whole', async () => {
	await renderSSR(SharedPage);
	await pinSharedBodyRuns();
});
