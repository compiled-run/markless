import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/scoped-dynamic-class.tsrx';

// A scoped <style> rewrites `.line` to `.line.mk-xxx`, so the rule only paints an
// element that carries the scope class. An element whose class is an expression
// has to compose with the scope on first paint AND keep it across every toggle -
// the runtime rewrites the whole attribute, so a dropped scope is permanent.
afterEach(() => cleanup());

function scopeClassOf(element: Element): string {
	const found = Array.from(element.classList).find((name) => name.startsWith('mk-'));
	expect(found, `no scope class on ${element.outerHTML}`).toMatch(/^mk-[a-z0-9]+$/);
	return found!;
}

function expectPainted(element: HTMLElement, scope: string, lit: boolean): void {
	expect(element.classList.contains('line')).toBe(true);
	expect(element.classList.contains(scope)).toBe(true);
	// The scoped rule reaches it, which is the whole point of carrying the class.
	expect(getComputedStyle(element).color).toBe('rgb(0, 0, 255)');
	expect(getComputedStyle(element).fontWeight).toBe(lit ? '700' : '400');
}

async function expectScopedToggle(container: ParentNode): Promise<void> {
	const staticLine = container.querySelector<HTMLElement>('[data-static]')!;
	// A two-literal conditional bakes the scope into each arm; a plain expression
	// has no arms, so the writers compose the scope back on every update.
	const dynamic = container.querySelector<HTMLElement>('[data-dynamic]')!;
	const plain = container.querySelector<HTMLElement>('[data-plain]')!;
	const scope = scopeClassOf(staticLine);

	expectPainted(dynamic, scope, false);
	expectPainted(plain, scope, false);

	container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
	await expect.poll(() => dynamic.classList.contains('lit')).toBe(true);
	await expect.poll(() => plain.classList.contains('lit')).toBe(true);
	expectPainted(dynamic, scope, true);
	expectPainted(plain, scope, true);

	container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
	await expect.poll(() => dynamic.classList.contains('lit')).toBe(false);
	await expect.poll(() => plain.classList.contains('lit')).toBe(false);
	expectPainted(dynamic, scope, false);
	expectPainted(plain, scope, false);
}

test('CSR: a dynamic class keeps the style scope through a toggle both directions', async () => {
	const screen = await render(App);
	await expectScopedToggle(screen.container as HTMLElement);
});

test('SSR: a dynamic class is scoped in the served HTML and stays scoped after a toggle', async () => {
	const screen = await renderSSR(App);
	await expectScopedToggle(screen.container);
});
