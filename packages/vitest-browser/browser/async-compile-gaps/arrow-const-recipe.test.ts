import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import ArrowConstRecipe from './arrow-const-recipe.tsrx';

// An async recipe and a handler calling semicolon-less module-scope arrow consts build and run.

async function nextCycle(container: HTMLElement) {
	await expect.poll(() => container.querySelector('[data-title]')?.textContent).toBe('item-1');
	container.querySelector<HTMLButtonElement>('button[data-next]')!.click();
	await expect.poll(() => container.querySelector('[data-title]')?.textContent).toBe('item-2');
}

test('CSR: an async recipe calling a semicolon-less module-scope arrow const settles and refreshes', async () => {
	const screen = await render(ArrowConstRecipe);
	await nextCycle(screen.container as HTMLElement);
});

test('SSR: an async recipe calling a semicolon-less module-scope arrow const settles and refreshes', async () => {
	const screen = await renderSSR(ArrowConstRecipe);
	await nextCycle(screen.container as HTMLElement);
});
