import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import PropMixed from './fixtures/prop-mixed.tsrx';

// A child's own state recombined with a destructured prop follows both: the parent's
// write to the prop and the child's own write.
afterEach(() => cleanup());

function attributes(container: ParentNode, selector: string, name: string) {
	return [...container.querySelectorAll(selector)].map((node) => node.getAttribute(name));
}

async function expectMixedReadsFollow(container: ParentNode) {
	const labels = () => attributes(container, '[data-panel]', 'data-label');
	const titles = () => attributes(container, '[data-pane]', 'data-title');
	expect(labels()).toEqual(['alpha', 'fixed']);
	expect(titles()).toEqual(['alpha!', 'still!', 'none!']);

	container.querySelector<HTMLElement>('[data-rename]')?.click();
	await expect.poll(labels).toEqual(['alpha+', 'fixed']);
	await expect.poll(titles).toEqual(['alpha+!', 'still!', 'none!']);

	container.querySelector<HTMLElement>('[data-panel]')?.click();
	await expect.poll(labels).toEqual(['alpha+ (open)', 'fixed']);
	container.querySelectorAll<HTMLElement>('[data-panel]')[1]?.click();
	await expect.poll(labels).toEqual(['alpha+ (open)', 'fixed (open)']);

	container.querySelector<HTMLElement>('[data-rename]')?.click();
	await expect.poll(labels).toEqual(['alpha++ (open)', 'fixed (open)']);
	await expect.poll(titles).toEqual(['alpha++!', 'still!', 'none!']);

	container.querySelectorAll<HTMLElement>('[data-pane]')[2]?.click();
	await expect.poll(titles).toEqual(['alpha++!', 'still!', '-']);
	container.querySelectorAll<HTMLElement>('[data-pane]')[2]?.click();
	await expect.poll(titles).toEqual(['alpha++!', 'still!', 'none!']);
}

test('CSR: a child recombining its state with a prop follows the parent write', async () => {
	const screen = await render(PropMixed);
	await expectMixedReadsFollow(screen.container as HTMLElement);
});

test('SSR resume: a child recombining its state with a prop follows the parent write', async () => {
	const screen = await renderSSR(PropMixed);
	await expectMixedReadsFollow(screen.container);
});
