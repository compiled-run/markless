import { afterEach, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { cleanup, render } from '../../src/index.ts';
import LayeredPage from './abr-layer-host.tsrx';

// On a slow main thread a @try re-settle's commit can land before the old rows' repeat reorders them.

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
