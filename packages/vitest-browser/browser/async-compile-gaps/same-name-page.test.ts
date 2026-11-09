import { afterEach, expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import SameNamePage from './same-name-page.tsrx';
import SameNamePolicy from './same-name-policy.tsrx';

// The page's @for and handlers read its own values when a same-file child declared first takes a prop of the same name.

const prevented: boolean[] = [];
const record = (event: Event) => {
	if ((event.target as Element | null)?.closest?.('[data-onward], [data-go]')) {
		prevented.push(event.defaultPrevented);
		event.preventDefault();
	}
};

afterEach(() => {
	document.removeEventListener('click', record);
	prevented.length = 0;
	if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});

function entries(container: HTMLElement) {
	return [...container.querySelectorAll('[data-entries] li')].map((item) => item.textContent);
}

async function pageCycle(container: HTMLElement) {
	document.addEventListener('click', record);
	expect(entries(container)).toEqual(['a', 'b']);
	container.querySelector<HTMLAnchorElement>('[data-onward]')!.click();
	expect(prevented).toEqual([true]);
	container.querySelector<HTMLButtonElement>('[data-add]')!.click();
	await expect.poll(() => entries(container)).toEqual(['a', 'b', 'c']);
	await expect.poll(() => container.querySelector('[data-note]')?.textContent).toBe('3');
	container.querySelector<HTMLButtonElement>('[data-release]')!.click();
	await expect.poll(() => {
		prevented.length = 0;
		container.querySelector<HTMLAnchorElement>('[data-onward]')!.click();
		return prevented[0];
	}).toBe(false);
}

test('CSR: page values with the names of a same-file child prop read the page', async () => {
	const screen = await render(SameNamePage);
	await pageCycle(screen.container as HTMLElement);
});

test('SSR: page values with the names of a same-file child prop read the page', async () => {
	const screen = await renderSSR(SameNamePage);
	await pageCycle(screen.container as HTMLElement);
});

async function policyCycle(container: HTMLElement) {
	document.addEventListener('click', record);
	container.querySelector<HTMLAnchorElement>('[data-go]')!.click();
	expect(prevented).toEqual([true]);
	container.querySelector<HTMLButtonElement>('[data-unblock]')!.click();
	await expect.poll(() => {
		prevented.length = 0;
		container.querySelector<HTMLAnchorElement>('[data-go]')!.click();
		return prevented[0];
	}).toBe(false);
}

test('CSR: a link policy reads page state, not a same-file child prop of the same name', async () => {
	const screen = await render(SameNamePolicy);
	await policyCycle(screen.container as HTMLElement);
});

test('SSR: a link policy reads page state, not a same-file child prop of the same name', async () => {
	const screen = await renderSSR(SameNamePolicy);
	await policyCycle(screen.container as HTMLElement);
});
