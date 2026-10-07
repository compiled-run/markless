import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { Boxes } from './indicator-element.tsrx';

// The indicator shows its children only while the box is ticked, and those
// children may be elements (an icon, a styled span), not just text.

afterEach(() => cleanup());

const box = (container: ParentNode, name: string) =>
	container.querySelector<HTMLElement>(`[data-case="${name}"]`)!;
const mark = (container: ParentNode, name: string) =>
	box(container, name).querySelector('[data-mark]');
const trigger = (container: ParentNode, name: string) =>
	box(container, name).querySelector<HTMLButtonElement>('[data-trigger]')!;

for (const [mode, mount] of [
	['ssr', () => renderSSR(Boxes)],
	['csr', () => render(Boxes)],
] as const) {
	test(`${mode}: an element child shows only while its box is ticked`, async () => {
		const { container } = await mount();
		expect(mark(container, 'icon-off')).toBeNull();
		expect(mark(container, 'span-off')).toBeNull();
		expect(mark(container, 'component-off')).toBeNull();
		expect(mark(container, 'span-on')?.textContent).toBe('x');

		trigger(container, 'span-off').click();
		await expect.poll(() => mark(container, 'span-off')?.textContent).toBe('x');
		expect(mark(container, 'span-off')?.className).toBe('tick');

		trigger(container, 'icon-off').click();
		await expect.poll(() => mark(container, 'icon-off')?.tagName.toLowerCase()).toBe('svg');

		trigger(container, 'component-off').click();
		await expect
			.poll(() => mark(container, 'component-off')?.getAttribute('aria-label'))
			.toBe('ticked');

		trigger(container, 'span-on').click();
		await expect.poll(() => mark(container, 'span-on')).toBeNull();
		trigger(container, 'span-on').click();
		await expect.poll(() => mark(container, 'span-on')?.textContent).toBe('x');
	});
}
