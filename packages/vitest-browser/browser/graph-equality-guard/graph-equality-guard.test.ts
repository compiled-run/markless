import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './geg-page.tsrx';

afterEach(cleanup);

const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

function cancelled(target: Element): boolean {
	const event = new MouseEvent('click', { bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event.defaultPrevented;
}

// Read synchronously: a guard comparing a prop or state() with a literal has to
// cancel before the handler module can have loaded.
async function pinGuardsCompareValues() {
	const [shown, other] = all('[data-nav]');
	expect(cancelled(shown!)).toBe(true);
	expect(cancelled(other!)).toBe(false);

	const [firstTab] = all('[data-tab]');
	expect(cancelled(firstTab!)).toBe(true);
	all('[data-switch]')[0]!.click();
	await expect.poll(() => all('[data-tab]')[0]!.textContent).toBe('show');
	expect(cancelled(firstTab!)).toBe(false);
	expect(cancelled(all('[data-tab]')[1]!)).toBe(true);
}

test('CSR: a guard comparing a prop or a state with a literal decides the cancel', async () => {
	await render(Page);
	await pinGuardsCompareValues();
});

test('SSR: a guard comparing a prop or a state with a literal decides the cancel before the handler loads', async () => {
	await renderSSR(Page);
	await pinGuardsCompareValues();
});
