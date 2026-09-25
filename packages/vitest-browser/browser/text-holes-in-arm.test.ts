import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/text-holes-in-arm.tsrx';

// Several holes rendering into one text node update as one joined text: beside
// an element, inside an arm, and inside a component an arm mounts, whose joined
// text is that instance's own and not the page's.
afterEach(() => cleanup());

const text = (container: ParentNode, selector: string) =>
	container.querySelector<HTMLElement>(selector)?.textContent;
const click = (container: ParentNode, selector: string) =>
	container.querySelector<HTMLElement>(selector)?.click();

async function expectHolesFollow(container: ParentNode) {
	expect(text(container, '[data-flat]')).toBe('chip 0/0');
	expect(text(container, '[data-mixed]')).toBe('0 and 0!');
	expect(text(container, '[data-chip]')).toBe('chip 0/0');
	expect(text(container, '[data-own]')).toBe('chip 0/0');

	click(container, '[data-tap]');
	await expect.poll(() => text(container, '[data-flat]')).toBe('chip 1/2');
	await expect.poll(() => text(container, '[data-mixed]')).toBe('1 and 2!');
	await expect.poll(() => text(container, '[data-chip]')).toBe('chip 1/2');
	expect(container.querySelector('[data-mixed] > b[data-mark]')).not.toBeNull();

	click(container, '[data-own]');
	await expect.poll(() => text(container, '[data-own]')).toBe('chip 1/2');
	click(container, '[data-own]');
	await expect.poll(() => text(container, '[data-own]')).toBe('chip 2/4');

	// Closed and reopened, both arms are live again; the component starts over.
	click(container, '[data-open]');
	await expect.poll(() => text(container, '[data-own]')).toBeUndefined();
	click(container, '[data-open]');
	await expect.poll(() => text(container, '[data-own]')).toBe('chip 0/0');
	click(container, '[data-tap]');
	await expect.poll(() => text(container, '[data-chip]')).toBe('chip 2/4');
	click(container, '[data-own]');
	await expect.poll(() => text(container, '[data-own]')).toBe('chip 1/2');
}

test('CSR: several holes in one text node each follow their value', async () => {
	const screen = await render(App);
	await expectHolesFollow(screen.container as HTMLElement);
});

test('SSR resume: several holes in one text node each follow their value', async () => {
	const screen = await renderSSR(App);
	await expectHolesFollow(screen.container);
});
