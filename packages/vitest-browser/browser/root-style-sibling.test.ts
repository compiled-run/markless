import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RootStyleSibling from './fixtures/root-style-sibling.tsrx';

// A <style> beside a component's root elements, or inside one of several roots, ships its scoped rules.
afterEach(() => cleanup());

async function expectStyledAndLive(container: HTMLElement) {
	const color = (selector: string) =>
		getComputedStyle(container.querySelector(selector) as Element).color;
	await expect.poll(() => color('[data-tally]')).toBe('rgb(101, 102, 103)');
	expect(color('[data-panel]')).toBe('rgb(7, 8, 9)');
	expect(container.querySelector('style')).toBeNull();
	container.querySelector<HTMLElement>('[data-count]')?.click();
	await expect.poll(() => container.querySelector('[data-count]')?.textContent).toBe('1');
}

test('CSR: a component whose roots carry <style> blocks renders styled and stays interactive', async () => {
	const screen = await render(RootStyleSibling);
	await expectStyledAndLive(screen.container as HTMLElement);
});

test('SSR: a component whose roots carry <style> blocks renders styled and stays interactive', async () => {
	const screen = await renderSSR(RootStyleSibling);
	await expectStyledAndLive(screen.container as HTMLElement);
});
