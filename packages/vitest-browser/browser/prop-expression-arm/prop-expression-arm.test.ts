import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import RangePage from './range-page.tsrx';

// An @if decided by an expression of props renders and rebuilds arms whose attributes and text are expressions of props.
afterEach(() => cleanup());

const panel = (container: ParentNode) => container.querySelector<HTMLElement>('[data-panel]');
const range = (container: ParentNode) => container.querySelector<HTMLElement>('[data-range]');
const press = (container: ParentNode, name: string) =>
	container.querySelector<HTMLButtonElement>(`[data-${name}]`)!.click();

async function expectArmsFollowProps(container: HTMLElement) {
	expect(panel(container)?.id).toBe('a!');
	expect(panel(container)?.title).toBe('A');
	expect(panel(container)?.textContent).toBe('a!');
	expect(range(container)?.getAttribute('aria-label')).toBe('a!');

	press(container, 'rename');
	await expect.poll(() => panel(container)?.id).toBe('ab!');
	expect(panel(container)?.textContent).toBe('ab!');
	expect(range(container)?.getAttribute('aria-label')).toBe('ab!');

	press(container, 'far');
	await expect.poll(() => panel(container)).toBeNull();
	expect(container.querySelector('[data-other]')).not.toBeNull();
	expect(range(container)).toBeNull();

	press(container, 'rename');
	press(container, 'near');
	await expect.poll(() => panel(container)?.id).toBe('abb!');
	expect(panel(container)?.title).toBe('ABB');
	expect(panel(container)?.textContent).toBe('abb!');
	await expect.poll(() => range(container)?.getAttribute('aria-label')).toBe('abb!');

	press(container, 'shrink');
	await expect.poll(() => range(container)).toBeNull();
	expect(panel(container)?.id).toBe('abb!');
}

test('SSR: arms an expression of props decides follow those props after resume', async () => {
	await expectArmsFollowProps((await renderSSR(RangePage)).container as HTMLElement);
});

test('CSR: arms an expression of props decides follow those props', async () => {
	await expectArmsFollowProps((await render(RangePage)).container as HTMLElement);
});
