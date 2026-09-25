import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import WholePropsPage from './fixtures/whole-props-page.tsrx';

// Whole-props components reading props by name render and resume like destructured ones.
afterEach(() => cleanup());

async function expectWholePropsPage(container: HTMLElement) {
	const frame = container.querySelector('section.frame[data-frame]');
	expect(frame?.getAttribute('title')).toBe('Frame title');
	expect(frame?.querySelector('div.shell[data-shell] > p[data-body]')?.textContent).toBe('Body');
	const open = frame!.querySelector<HTMLButtonElement>('button[data-open]')!;
	open.click();
	await expect.poll(() => open.textContent).toBe('1');

	const tile = container.querySelector('article[data-tile]')!;
	expect(tile.querySelector('[data-heading]')?.textContent).toBe('Hits');
	expect(tile.querySelector('p[data-tile-body]')?.textContent).toBe('Tile body');
	const bump = tile.querySelector<HTMLButtonElement>('button[data-bump]')!;
	expect(bump.textContent).toBe('1');
	bump.click();
	await expect.poll(() => container.querySelector('output[data-hits]')?.textContent).toBe('2');
	await expect.poll(() => bump.textContent).toBe('2');
}

test('SSR: whole-props member reads render, resume and update', async () => {
	const screen = await renderSSR(WholePropsPage);
	await expectWholePropsPage(screen.container as HTMLElement);
});

test('CSR: whole-props member reads render and update', async () => {
	const screen = await render(WholePropsPage);
	await expectWholePropsPage(screen.container as HTMLElement);
});
