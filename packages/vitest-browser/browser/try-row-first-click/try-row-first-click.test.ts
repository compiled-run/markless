import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Store from './arg-try-rows-host.tsrx';
import Picker from './arg-try-rows.tsrx';

afterEach(cleanup);

const errors: string[] = [];
const onError = (event: ErrorEvent | PromiseRejectionEvent) =>
	errors.push(String('reason' in event ? event.reason : event.message));
window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onError);
afterEach(() => void errors.splice(0));

// Clicks the row the moment it is inserted, before its records can have registered.
function clickWhenPainted(name: string) {
	return new Promise<void>((resolve) => {
		const observer = new MutationObserver(() => {
			const row = [...document.querySelectorAll<HTMLElement>('[data-result]')].find(
				(candidate) => candidate.textContent?.trim() === name,
			);
			if (!row) return;
			observer.disconnect();
			row.click();
			resolve();
		});
		observer.observe(document.body, { childList: true, subtree: true });
	});
}

async function firstClickOnFreshRowsLands() {
	const type = (value: string) => {
		const query = document.querySelector<HTMLInputElement>('[data-query]')!;
		query.value = value;
		query.dispatchEvent(new Event('input', { bubbles: true }));
	};
	const picked = () => document.querySelector('[data-picked]')?.textContent;
	const fig = clickWhenPainted('Fig');
	document.querySelector<HTMLElement>('[data-open]')!.click();
	await fig;
	await expect.poll(picked).toBe('Fig');
	const guava = clickWhenPainted('Guava');
	type('gu');
	await guava;
	await expect.poll(picked).toBe('Guava');
	const kiwi = clickWhenPainted('Kiwi');
	type('k');
	await kiwi;
	await expect.poll(picked).toBe('Kiwi');
	expect(errors).toEqual([]);
}

test('CSR: a click on rows a @try just painted is never lost', async () => {
	await render(Picker);
	await firstClickOnFreshRowsLands();
});

test('SSR: a click on rows a @try just painted is never lost', async () => {
	await renderSSR(Picker);
	await firstClickOnFreshRowsLands();
});

test('CSR: a click on rows a @try just painted two components down is never lost', async () => {
	await render(Store);
	await firstClickOnFreshRowsLands();
});

test('SSR: a click on rows a @try just painted two components down is never lost', async () => {
	await renderSSR(Store);
	await firstClickOnFreshRowsLands();
});
