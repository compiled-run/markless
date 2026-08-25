import { cleanup, render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Limits from './scenarios/limits.tsrx';

// Its own file because a compiled page installs its row-minting loader into a
// single unqualified global: a second page module imported here would take the
// global and leave these rows throwing MARKLESS_PRERENDER_DATA_COMPONENT_MISSING.
const Root = page.getByTestId('root');

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function titles() {
	return [...el(Root).querySelectorAll('[ui-toasttitle]')].map((one) => one.textContent);
}

test('CSR: more messages than a capped region shows are queued, not dropped', async () => {
	await render(Limits);
	el<HTMLButtonElement>(page.getByTestId('four')).click();
	// All four are held: the repeat shows two, the queue keeps everything.
	await expect.poll(() => el(page.getByTestId('queued')).textContent).toBe('4');
});

test('CSR: a capped region shows its cap, and dismissing brings the next forward', async () => {
	await render(Limits);
	el<HTMLButtonElement>(page.getByTestId('four')).click();
	await expect.poll(() => titles()).toEqual(['One', 'Two']);
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual(['Two', 'Three']);
	expect(el(page.getByTestId('queued')).textContent).toBe('3');
});
