import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { StaticPage } from './static-page.tsrx';

afterEach(() => cleanup());

const poll = { timeout: 5_000, interval: 5 };
const text = (container: ParentNode, selector: string) =>
	container.querySelector(selector)?.textContent ?? null;
const click = (container: ParentNode, selector: string) => {
	const target = container.querySelector<HTMLElement>(selector);
	if (!target) throw new Error(`Expected ${selector} in the rendered DOM.`);
	target.click();
};

// `{children}` sits inside the child's @try: a CSR mount serves @pending first, so the
// projection lands when the settled arm renders, and comes back after a failure and reset.
test.each([
	['CSR', () => render(StaticPage)],
	['SSR', () => renderSSR(StaticPage)],
] as const)('children projected into a component render inside its @try (%s)', async (_mode, mount) => {
	const container = (await mount()).container as HTMLElement;
	await expect.poll(() => text(container, '[data-heading]'), poll).toBe('Ledger 0');
	expect(text(container, '[data-body] [data-projected]')).toBe('Projected entry');

	click(container, '[data-retry]');
	await expect.poll(() => text(container, '[data-failed]'), poll).toBe('Failed');
	click(container, '[data-retry]');
	await expect.poll(() => text(container, '[data-heading]'), poll).toBe('Ledger 2');
	expect(text(container, '[data-body] [data-projected] em')).toBe('entry');
});

// A redrawn arm carries projected markup as static HTML, so the dev server refuses a page that
// projects handlers or state reads into a child's @try; bundler/test/dev-projection-live-arm.test.ts pins the message.
test('live projected children inside a child @try are refused by the dev server', async () => {
	const response = await fetch(`${new URL('./live-page.tsrx', import.meta.url).href}?import`);
	expect(response.status).toBe(500);
	await expect(import('./live-page.tsrx')).rejects.toThrow(/Failed to fetch dynamically imported module/);
});
