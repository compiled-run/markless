import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/text-in-escalated-arm.tsrx';

// Page markup inside an @if arm that also holds a stateful component: the arm
// re-renders as a whole on flip, and the page's own text and handlers there
// must keep following the page's values afterwards.
afterEach(() => cleanup());

const text = (container: ParentNode, selector: string) =>
	container.querySelector<HTMLElement>(selector)?.textContent;
const click = (container: ParentNode, selector: string) =>
	container.querySelector<HTMLElement>(selector)?.click();

async function expectArmTextFollows(container: ParentNode) {
	click(container, '[data-open]');
	await expect.poll(() => text(container, '[data-one]')).toBe('0');
	expect(text(container, '[data-two]')).toBe('chip 0/0');

	click(container, '[data-tap]');
	await expect.poll(() => text(container, '[data-one]')).toBe('1');
	await expect.poll(() => text(container, '[data-two]')).toBe('chip 1/2');

	click(container, '[data-inner]');
	await expect.poll(() => text(container, '[data-one]')).toBe('11');
	await expect.poll(() => text(container, '[data-two]')).toBe('chip 11/22');

	click(container, '[data-own]');
	await expect.poll(() => text(container, '[data-own]')).toBe('own 1');
	expect(text(container, '[data-one]')).toBe('11');

	click(container, '[data-open]');
	await expect.poll(() => text(container, '[data-one]')).toBeUndefined();
	click(container, '[data-tap]');
	click(container, '[data-open]');
	await expect.poll(() => text(container, '[data-one]')).toBe('12');
	expect(text(container, '[data-own]')).toBe('own 0');
	click(container, '[data-tap]');
	await expect.poll(() => text(container, '[data-two]')).toBe('chip 13/26');
}

test('CSR: page text beside a stateful component in an arm follows its values', async () => {
	const screen = await render(App);
	await expectArmTextFollows(screen.container as HTMLElement);
});

test('SSR resume: page text beside a stateful component in an arm follows its values', async () => {
	const screen = await renderSSR(App);
	await expectArmTextFollows(screen.container);
});
