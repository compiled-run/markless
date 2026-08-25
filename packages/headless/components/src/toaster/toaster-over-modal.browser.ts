import { cleanup, render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import OverModal from './scenarios/over-modal.tsrx';

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

test('CSR: a dialog leaves the messages behind it reachable', async () => {
	await render(OverModal);
	el<HTMLButtonElement>(page.getByTestId('modal-trigger')).click();
	await expect.poll(() => el(page.getByTestId('modal-backdrop')).hasAttribute('hidden')).toBe(false);
	el<HTMLButtonElement>(page.getByTestId('say')).click();
	await expect.poll(() => titles()).toEqual(['Deleted']);
	// The live region is neither inert nor hidden while the dialog holds the page.
	expect(el(Root).hasAttribute('inert')).toBe(false);
	expect(el(Root).getAttribute('aria-hidden')).toBe(null);
	expect((el(Root).querySelector('[ui-toast]') as HTMLElement).closest('[inert]')).toBe(null);
});

// The half of the row above that does NOT need a rendered message: a dialog must
// not take the live region out of reach, whether or not anything has been said.
test('CSR: a dialog does not take the live region out of reach', async () => {
	await render(OverModal);
	el<HTMLButtonElement>(page.getByTestId('modal-trigger')).click();
	await expect.poll(() => el(page.getByTestId('modal-backdrop')).hasAttribute('hidden')).toBe(false);
	expect(el(Root).hasAttribute('inert')).toBe(false);
	expect(el(Root).getAttribute('aria-hidden')).toBe(null);
	expect(el(Root).closest('[inert]')).toBe(null);
});
