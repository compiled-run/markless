import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import NoCrashPage from './fixtures/scoped-outside-nocrash.tsrx';
import PageControl from './fixtures/scoped-page-control.tsrx';
import EffectOnlyPage from './fixtures/scoped-effect-only.tsrx';

afterEach(cleanup);

test('pure-state composed child events wire on CSR', async () => {
	const screen = await render(NoCrashPage);
	const button = screen.container.querySelector('[data-safe-sibling]') as HTMLButtonElement;
	expect(button).not.toBeNull();
	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});

test('control: pure-state PAGE button wires in this harness', async () => {
	const screen = await render(PageControl);
	const button = screen.container.querySelector('[data-page-button]') as HTMLButtonElement;
	expect(button).not.toBeNull();
	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});

// Effect-only handlers (no graph reads/writes) get event records and their
// throws are contained + reported like any other handler.
test('effect-only handlers (no graph ops) dispatch and contain their throws', async () => {
	const screen = await render(EffectOnlyPage);
	const button = screen.container.querySelector('[data-effect-only]') as HTMLButtonElement;
	let seen = 0;
	globalThis.reportError = () => {
		seen++;
	};
	button.click();
	await expect.poll(() => seen).toBe(1);
});
