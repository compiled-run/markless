import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import BasketPage from './shared-passed-to-function/basket-page.tsrx';

// A shared() value that is one state object, passed to a plain function that changes it.
afterEach(() => cleanup());

const text = (root: ParentNode, selector: string) => root.querySelector(selector)?.textContent?.trim();
const click = (root: ParentNode, selector: string) =>
	root.querySelector<HTMLButtonElement>(selector)!.click();

test('SSR: a function changes the shared() value a handler passes it', async () => {
	const { container } = await renderSSR(BasketPage);
	expect([text(container, '[data-count]'), text(container, '[data-note]')]).toEqual(['0', 'empty']);
	click(container, '[data-fill]');
	await expect.poll(() => [text(container, '[data-count]'), text(container, '[data-note]')]).toEqual([
		'2',
		'holds 2',
	]);
	click(container, '[data-fill]');
	await expect.poll(() => text(container, '[data-count]')).toBe('4');
});
