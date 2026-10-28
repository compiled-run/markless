import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import DirectoryPage from './directory-page.tsrx';
import Page from './page.tsrx';

// An @if in a keyed row inside an @try arm: the arm keeps working as its rows come and go, down to none.
afterEach(() => cleanup());

const shown = (container: HTMLElement) =>
	[...container.querySelectorAll('#list .item')].map((item) => `${item.textContent?.trim()}${item.querySelector('hr') ? '-' : ''}`).join(' ') +
	` | ${container.querySelector('#none, #some')?.id}`;

async function checkRows(container: HTMLElement) {
	const errors: string[] = [];
	const record = (event: ErrorEvent | PromiseRejectionEvent) =>
		errors.push(String('reason' in event ? event.reason : event.message));
	addEventListener('error', record);
	addEventListener('unhandledrejection', record);
	try {
		const type = (value: string) => {
			const input = container.querySelector<HTMLInputElement>('#q')!;
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		};
		await expect.poll(() => shown(container)).toBe('ada- bob- cyd | some');
		type('zz');
		await expect.poll(() => shown(container)).toBe(' | none');
		type('b');
		await expect.poll(() => shown(container)).toBe('bob | some');
		type('');
		await expect.poll(() => shown(container)).toBe('ada- bob- cyd | some');
		container.querySelectorAll<HTMLButtonElement>('#list button')[2]!.click();
		await expect.poll(() => container.querySelector('#picked')?.textContent).toBe('cyd');
		expect(errors).toEqual([]);
	} finally {
		removeEventListener('error', record);
		removeEventListener('unhandledrejection', record);
	}
}

test('SSR: rows with an @if inside an @try arm empty out and come back without an anchor error', async () => {
	await checkRows((await renderSSR(DirectoryPage)).container as HTMLElement);
});

test('CSR: rows with an @if inside an @try arm empty out and come back without an anchor error', async () => {
	await checkRows((await render(DirectoryPage)).container as HTMLElement);
});

test('SSR: the same list in a child component keeps working after resume', async () => {
	await checkRows((await renderSSR(Page)).container as HTMLElement);
});

test('CSR: the same list in a child component keeps working', async () => {
	await checkRows((await render(Page)).container as HTMLElement);
});
