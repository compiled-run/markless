import { cleanup, render } from '../../src/index.ts';
import { afterEach, expect, test } from 'vitest';
import Page from './page.tsrx';

// A derive bound on an edge inside an imported module loads through that module's resolver, so its id carries the composer's instance path.
afterEach(cleanup);

test('CSR: a derive bound on an imported module inner edge renders and refreshes', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	const rung = () => container.querySelector('[data-rung]')?.textContent;

	expect(container.querySelector('[data-ladder]')?.textContent).toBe('1');
	expect(rung()).toBe('11');

	(container.querySelector('[data-bump]') as HTMLButtonElement).click();
	await expect.poll(rung).toBe('12');
});
