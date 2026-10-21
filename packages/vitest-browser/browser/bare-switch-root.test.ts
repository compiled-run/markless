import { cleanup, render, renderSSR } from '../src/index.ts';
import { afterEach, expect, test } from 'vitest';
import Page from './fixtures/bare-switch-root.tsrx';

// A template that is one bare @switch renders its case and flips like the same switch inside <>...</>.

afterEach(cleanup);

async function exercise(container: ParentNode) {
	const view = () => container.querySelector('main')?.getAttribute('data-view');
	const next = () => (container.querySelector('[data-next]') as HTMLButtonElement).click();

	expect(view()).toBe('a');
	next();
	await expect.poll(view).toBe('other');
	next();
	await expect.poll(view).toBe('a');
}

test('CSR: a bare @switch root renders and flips its case', async () => {
	const screen = await render(Page);
	await exercise(screen.container as HTMLElement);
});

test('SSR: a bare @switch root renders and flips its case after resume', async () => {
	const screen = await renderSSR(Page);
	await exercise(screen.container as HTMLElement);
});
