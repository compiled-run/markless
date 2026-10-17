import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/attach-writes-state.tsrx';

afterEach(() => cleanup());

function text(container: ParentNode, selector: string): string | null | undefined {
	return container.querySelector(selector)?.textContent;
}

async function expectWrites(container: ParentNode): Promise<void> {
	await expect.poll(() => text(container, '[data-measured]')).toBe('div');
	await expect.poll(() => text(container, '[data-label]')).toBe('card');
	await expect.poll(() => text(container, '[data-seen-count]')).toBe('1');
	container.querySelector<HTMLButtonElement>('[data-bump]')?.click();
	await expect.poll(() => text(container, '[data-bump]')).toBe('1');
	expect(text(container, '[data-measured]')).toBe('div');
}

test('SSR: a state write inside attach reaches the page', async () => {
	const screen = await renderSSR(App);
	await expectWrites(screen.container);
});

test('CSR: a state write inside attach reaches the page', async () => {
	const screen = await render(App);
	await expectWrites(screen.container as HTMLElement);
});
