import { cleanup, render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/part-props.tsrx';

afterEach(async () => {
	await cleanup();
});

test('CSR: a consumer handler on a part is dropped without a word', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const trigger = container.querySelector(
		'[data-case="handler"] button',
	) as HTMLButtonElement;
	const clicks = container.querySelector('[data-probe="clicks"]') as HTMLElement;
	const indicator = container.querySelector(
		'[data-case="handler"] span',
	) as HTMLElement;

	trigger.click();
	// The part's own handler ran.
	await expect.poll(() => indicator.textContent).toBe('Checked');
	// The consumer's did not, and nothing said so.
	expect(clicks.textContent).toBe('0');
});

test('CSR: a consumer el handle on a part is dropped without a word', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const trigger = container.querySelector('[data-case="handle"] button') as HTMLButtonElement;

	// The part still carries the id the family minted for its own handle, so the
	// consumer's handle never bound to this element and nothing reported it.
	expect(trigger.id).toContain('triggerEl');
	expect(trigger.id).not.toContain('consumerEl');
	expect(container.querySelector('[id*="consumerEl"]')).toBeNull();
});
