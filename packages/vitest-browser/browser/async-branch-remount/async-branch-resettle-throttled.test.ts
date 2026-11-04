import { afterEach, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { cleanup, render } from '../../src/index.ts';
import LayeredPage from './abr-layer-host.tsrx';
import NotesDrawer from './abr-notes.tsrx';

// On a slow main thread an @if render, a @try catch-up settle and the settle notification all race.

afterEach(cleanup);
afterEach(() => commands.throttleCpu(1));

const errors: string[] = [];
const onError = (event: ErrorEvent | PromiseRejectionEvent) =>
	errors.push(String('reason' in event ? event.reason : (event.error ?? event.message)));
window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onError);
afterEach(() => void errors.splice(0));

const list = () => document.querySelector<HTMLElement>('[data-list]');
const names = () => [...document.querySelectorAll('[data-result]')].map((node) => node.textContent?.trim());
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const type = (value: string) => {
	const query = document.querySelector<HTMLInputElement>('[data-query]')!;
	query.value = value;
	query.dispatchEvent(new Event('input', { bubbles: true }));
};

// About one run in eight lost the race on main, so twenty runs show it nearly every time.
for (let run = 1; run <= 20; run++) {
	test(`CSR: a @try re-settling while shown on a slow main thread keeps its rows (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await render(LayeredPage);
		click('[data-open]');
		await expect.poll(names).toEqual(['Apple', 'Apricot', 'Banana', 'Cherry']);
		click('[data-open]');
		await expect.poll(list).toBeNull();
		type('ap');
		click('[data-open]');
		await expect.poll(names).toEqual(['Apple', 'Apricot']);
		type('b');
		await expect.poll(names).toEqual(['Banana']);
		type('c');
		await expect.poll(names).toEqual(['Cherry']);
		type('');
		await expect.poll(names).toEqual(['Apple', 'Apricot', 'Banana', 'Cherry']);
		expect(errors).toEqual([]);
	});
}

const summaryText = () =>
	document.querySelector('[data-summary]')?.textContent ??
	document.querySelector('[data-trouble]')?.textContent;

// The catch-up settle and the notification after it both reach a plain @try; the one whose swap lands paints it.
for (let run = 1; run <= 8; run++) {
	test(`CSR: an @if/@else holding a @try settles each time it shows on a slow main thread (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await render(NotesDrawer);
		click('[data-toggle]');
		await expect.poll(summaryText).toBe('alpha summary');
		click('[data-toggle]');
		await expect.poll(() => document.querySelector('[data-folded]')).not.toBeNull();
		click('[data-next]');
		click('[data-toggle]');
		await expect.poll(summaryText).toBe('beta summary');
		click('[data-next]');
		await expect.poll(summaryText).toBe('No summary');
		expect(errors).toEqual([]);
	});
}
