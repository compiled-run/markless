import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/open-arm-first-click.tsrx';
import Shapes from './fixtures/open-arm-first-click-shapes.tsrx';

// The first click lands inside an @if arm that was already open when the page appeared.
afterEach(() => cleanup());

function text(container: ParentNode, selector: string): string | null | undefined {
	return container.querySelector(selector)?.textContent;
}

for (const [mode, mount, mountShapes] of [
	[
		'CSR',
		async () => (await render(App)).container as HTMLElement,
		async () => (await render(Shapes)).container as HTMLElement,
	],
	[
		'SSR',
		async () => (await renderSSR(App)).container,
		async () => (await renderSSR(Shapes)).container,
	],
] as const) {
	test(`${mode}: the first click inside an arm open at first render counts`, async () => {
		const container = await mount();
		await userEvent.click(container.querySelector<HTMLButtonElement>('[data-inside]')!);
		await expect.poll(() => text(container, '[data-count]')).toBe('1');
		expect(text(container, '[data-inside]')).toBe('1');
		await userEvent.click(container.querySelector<HTMLButtonElement>('[data-inside]')!);
		await expect.poll(() => text(container, '[data-count]')).toBe('2');
	});

	test(`${mode}: the first click inside an open @else arm or @switch case counts`, async () => {
		const container = await mountShapes();
		await userEvent.click(container.querySelector<HTMLButtonElement>('[data-case]')!);
		await expect.poll(() => text(container, '[data-taps]')).toBe('10');
		await userEvent.click(container.querySelector<HTMLButtonElement>('[data-else]')!);
		await expect.poll(() => text(container, '[data-taps]')).toBe('11');
	});
}
