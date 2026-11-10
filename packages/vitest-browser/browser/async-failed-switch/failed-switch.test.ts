import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import CardPage from './card-page.tsrx';
import InvoicesPage from './invoices-page.tsrx';

// A list priced in the currency a switch picks keeps following the switch after a refresh fails and keeps the list.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const texts = (selector: string) =>
	[...document.querySelectorAll(selector)].map((node) => node.textContent);
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function reply(key: string, failure?: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key, failure);
}

async function followsTheSwitchAfterAFailure() {
	expect(texts('[data-id]')).toEqual(['INV-1', 'INV-2', 'INV-3', 'INV-4']);
	click('[role=switch]');
	await expect.poll(() => texts('[data-amount]')[0]).toBe('$500');
	click('[role=switch]');
	await expect.poll(() => texts('[data-amount]')[0]).toBe('€250');
	click('[data-next]');
	await reply('page:2');
	await expect.poll(() => texts('[data-id]')).toEqual(['INV-5', 'INV-6', 'INV-7', 'INV-8']);
	await expect.poll(() => texts('[data-page-label]')).toEqual(['Page 2 of 2']);
	click('[aria-label="Select INV-5"]');
	await expect
		.poll(() =>
			document.querySelector('[aria-label="Select INV-5"]')?.getAttribute('aria-checked'),
		)
		.toBe('true');
	click('[data-prev]');
	await reply('page:1', 'offline');
	await expect.poll(() => texts('[data-alert]')).toEqual(["Couldn't load the next page."]);
	expect(texts('[data-id]')).toEqual(['INV-5', 'INV-6', 'INV-7', 'INV-8']);
	click('[role=switch]');
	await expect
		.poll(() => document.querySelector('[role=switch]')?.getAttribute('aria-checked'))
		.toBe('true');
	await expect.poll(() => texts('[data-amount]')).toEqual(['$1100', '$400', '$600', '$800']);
	click('[role=switch]');
	await expect.poll(() => texts('[data-amount]')).toEqual(['€550', '€200', '€300', '€400']);
	click('[data-reload]');
	await reply('page:1');
	await expect.poll(() => texts('[data-id]')).toEqual(['INV-1', 'INV-2', 'INV-3', 'INV-4']);
	expect(texts('[data-alert]')).toEqual([]);
	click('[role=switch]');
	await expect.poll(() => texts('[data-amount]')[0]).toBe('$550');
}

test('CSR: the switch reaches the kept list after a failed refresh', async () => {
	await render(InvoicesPage);
	await reply('page:1');
	await expect.poll(() => texts('[data-id]').length).toBe(4);
	await followsTheSwitchAfterAFailure();
});

test('SSR: the switch reaches the kept list after a failed refresh after resume', async () => {
	await renderSSR(InvoicesPage);
	await followsTheSwitchAfterAFailure();
});

test('CSR: the switch reaches the kept list of a restartable demo after a failed refresh', async () => {
	await render(CardPage);
	await reply('page:1');
	await expect.poll(() => texts('[data-id]').length).toBe(4);
	await followsTheSwitchAfterAFailure();
});

test('SSR: the switch reaches the kept list of a restartable demo after a failed refresh after resume', async () => {
	await renderSSR(CardPage);
	await followsTheSwitchAfterAFailure();
});

test('SSR: the switch reaches the kept list of a restarted demo after a failed refresh', async () => {
	await renderSSR(CardPage);
	click('[data-restart]');
	await reply('page:1');
	await expect.poll(() => texts('[data-id]').length).toBe(4);
	await followsTheSwitchAfterAFailure();
});
