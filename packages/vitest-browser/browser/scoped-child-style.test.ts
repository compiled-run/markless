import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/scoped-child-style.tsrx';

// A non-root component mints its own hash class onto its elements, so its <style> block has to reach the page too.
afterEach(() => cleanup());

function scopeClassOf(element: Element): string {
	const found = Array.from(element.classList).find((name) => name.startsWith('mk-'));
	expect(found, `no scope class on ${element.outerHTML}`).toMatch(/^mk-[a-z0-9]+$/);
	return found!;
}

async function expectChildStylePaints(container: ParentNode): Promise<void> {
	const page = container.querySelector<HTMLElement>('.page')!;
	const badge = container.querySelector<HTMLElement>('[data-badge]')!;
	const count = container.querySelector<HTMLElement>('[data-count]')!;
	// Each component gets its own hash class, so the page's rules never reach the badge.
	expect(scopeClassOf(badge)).not.toBe(scopeClassOf(page));
	expect(getComputedStyle(page).display).toBe('flex');
	expect(getComputedStyle(badge).color).toBe('rgb(0, 128, 0)');
	expect(getComputedStyle(count).fontWeight).toBe('700');

	container.querySelector<HTMLButtonElement>('[data-bump]')!.click();
	await expect.poll(() => count.textContent).toBe('4');
	expect(getComputedStyle(badge).color).toBe('rgb(0, 128, 0)');
}

test('CSR: a non-root component style block paints', async () => {
	const screen = await render(App);
	await expectChildStylePaints(screen.container as HTMLElement);
});

test('SSR: a non-root component style block paints in the served page', async () => {
	const screen = await renderSSR(App);
	await expectChildStylePaints(screen.container);
});
