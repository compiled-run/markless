import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { watchForThrows } from '../demand-load-replay/counting.ts';
import HandleNameCollisionPage from './page.tsrx';
import RootFieldPage from './root-page.tsrx';

afterEach(async () => {
	await cleanup();
});

const field = (testid: string) => page.getByTestId(testid).element() as HTMLInputElement;

// Two components that each declare a handle named `field` hold two separate handles.
for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: two components with a handle of the same name each focus their own element`, async () => {
		const thrown = watchForThrows();
		try {
			if (mode === 'CSR') await render(HandleNameCollisionPage);
			else await renderSSR(HandleNameCollisionPage);

			await userEvent.click(page.getByTestId('name-focus'));
			await expect.poll(() => document.activeElement).toBe(field('name-field'));

			await userEvent.click(page.getByTestId('search-focus'));
			await expect.poll(() => document.activeElement).toBe(field('search-field'));

			await userEvent.click(page.getByTestId('name-focus'));
			await expect.poll(() => document.activeElement).toBe(field('name-field'));
			await userEvent.keyboard('Ada');
			await expect.poll(() => page.getByTestId('name').element().textContent).toBe('Ada');
			expect(field('search-field').value).toBe('');
			expect(field('name-field').labels?.[0]?.textContent).toBe('Name');
			expect(field('search-field').labels?.[0]?.textContent).toBe('Search');
			expect(thrown.seen).toEqual([]);
		} finally {
			thrown.stop();
		}
	});
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a page and a child component with a handle of the same name each focus their own element`, async () => {
		const thrown = watchForThrows();
		try {
			if (mode === 'CSR') await render(RootFieldPage);
			else await renderSSR(RootFieldPage);

			await userEvent.click(page.getByTestId('search-focus'));
			await expect.poll(() => document.activeElement).toBe(field('search-field'));

			await userEvent.click(page.getByTestId('root-focus'));
			await expect.poll(() => document.activeElement).toBe(field('root-field'));

			await userEvent.click(page.getByTestId('search-focus'));
			await expect.poll(() => document.activeElement).toBe(field('search-field'));
			expect(thrown.seen).toEqual([]);
		} finally {
			thrown.stop();
		}
	});
}
