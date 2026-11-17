import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import QueuePage from './queue-page.tsrx';

// Tabs as a @switch whose arms each hold a keyed list of imported row components.
afterEach(cleanup);

const panel = () => {
	const body = document.querySelector('[data-panel]');
	return body
		? `${body.getAttribute('data-panel')}: ${[...body.querySelectorAll('[data-row]')].map((row) => row.textContent?.trim()).join(', ')}`
		: null;
};
const picked = () => document.querySelector('[data-picked]')?.textContent;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function pinTabs() {
	await expect.poll(panel).toBe('active: Brakes, Lights');
	click('[data-row="t3"]');
	await expect.poll(picked).toBe('Lights');
	click('[data-tab="resolved"]');
	await expect.poll(panel).toBe('resolved: Tyres');
	click('[data-row="t2"]');
	await expect.poll(picked).toBe('Tyres');
	click('[data-tab="active"]');
	await expect.poll(panel).toBe('active: Brakes, Lights');
	click('[data-row="t1"]');
	await expect.poll(picked).toBe('Brakes');
}

test('CSR: switching tabs swaps keyed lists of row components whose callback still runs', async () => {
	await render(QueuePage);
	await pinTabs();
});

test('SSR resume: switching tabs swaps keyed lists of row components whose callback still runs', async () => {
	await renderSSR(QueuePage);
	await pinTabs();
});
