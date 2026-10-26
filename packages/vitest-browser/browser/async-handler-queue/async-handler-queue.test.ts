import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import InputPage from './ahq-input.tsrx';
import Page from './ahq-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

// The slow handler stays pending until the test says so, so only a held queue keeps the count at 0.
async function pinLaterClicksFlow() {
	click('[data-slow]');
	await expect.poll(() => text('[data-slow-state]')).toBe('waiting');
	click('[data-quick]');
	click('[data-quick]');
	await expect.poll(() => text('[data-quick-count]')).toBe('2');
	expect(text('[data-slow-state]')).toBe('waiting');
	(globalThis as { __finishSlow?: () => void }).__finishSlow?.();
	await expect.poll(() => text('[data-slow-state]')).toBe('done');
}

test('CSR: a pending async handler does not hold later clicks', async () => {
	await render(Page);
	await pinLaterClicksFlow();
});

test('SSR: a pending async handler does not hold later clicks', async () => {
	await renderSSR(Page);
	await pinLaterClicksFlow();
});

const heldInputs = () => ((globalThis as { __heldInputs?: Array<() => void> }).__heldInputs ??= []);

// Each keystroke's handler must start on its own event, before the previous one's await settles.
async function pinFieldEventsFlow() {
	heldInputs().length = 0;
	const field = document.querySelector<HTMLInputElement>('[data-field]')!;
	for (const [index, value] of ['x', 'xy', 'xyz'].entries()) {
		field.value = value;
		field.dispatchEvent(new Event('input', { bubbles: true }));
		await expect.poll(() => heldInputs().length).toBe(index + 1);
	}
	for (const resolve of heldInputs().splice(0)) resolve();
	await expect.poll(() => text('[data-log]')).toBe(' x xy xyz');
}

test("CSR: a field's pending async handler does not hold its next events", async () => {
	await render(InputPage);
	await pinFieldEventsFlow();
});

test("SSR: a field's pending async handler does not hold its next events", async () => {
	await renderSSR(InputPage);
	await pinFieldEventsFlow();
});

for (const mode of ['CSR', 'SSR'] as const)
	test(`${mode}: a handler an inner click reaches reads its own element as currentTarget`, async () => {
		await (mode === 'CSR' ? render(InputPage) : renderSSR(InputPage));
		click('[data-inner]');
		await expect.poll(() => text('[data-owner]')).toBe('outer');
	});
