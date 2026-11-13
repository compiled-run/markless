import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import CustomerCard from './optional-read.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function followsEachCustomer() {
	await expect.poll(() => text('[data-optional]')).toBe('customer 1');
	expect(text('[data-asserted]')).toBe('tier 1');
	expect(document.querySelector('[data-asserted]')?.getAttribute('title')).toBe('tier 1');

	click('[data-next]');
	await expect.poll(() => text('[data-optional]')).toBe('customer 2');
	await expect.poll(() => text('[data-asserted]')).toBe('tier 2');
	expect(document.querySelector('[data-asserted]')?.getAttribute('title')).toBe('tier 2');

	click('[data-none]');
	await expect.poll(() => document.querySelector('[data-optional]')?.textContent?.trim()).toBe('');
}

// QUARANTINED, owner in docs/ci-process.md "Quarantined tests": two blocks settling on one value commit in separate tasks.
const quarantined = Date.now() < Date.parse('2026-11-27');
test.runIf(!quarantined)('the quarantine is still in date', () => {
	expect.fail('Quarantine expired on 2026-11-27: make blocks that settle together commit in one task and drop the quarantine.');
});

test.skipIf(quarantined)('CSR: a @try reading an async value through ?. or ! follows it', async () => {
	await render(CustomerCard);
	await expect.poll(() => text('[data-optional-loading]')).toBe('Loading');
	await followsEachCustomer();
});

test('SSR: a @try reading an async value through ?. or ! follows it', async () => {
	await renderSSR(CustomerCard);
	await followsEachCustomer();
});
