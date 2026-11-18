import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import DrawerPage from './shared-method-other-file/drawer-page.tsrx';

// A handler calls a shared() method defined in another file; the method writes only the definition's own state.
afterEach(() => cleanup());

const text = (root: ParentNode, selector: string) => root.querySelector(selector)?.textContent?.trim();
const click = (root: ParentNode, selector: string) =>
	root.querySelector<HTMLButtonElement>(selector)!.click();

test('SSR: a shared() method called from another file writes the state it owns', async () => {
	const { container } = await renderSSR(DrawerPage);
	expect(text(container, '[data-expanded]')).toBe('collapsed');
	click(container, '[data-flip]');
	await expect.poll(() => text(container, '[data-expanded]')).toBe('expanded');
	click(container, '[data-flip]');
	await expect.poll(() => text(container, '[data-expanded]')).toBe('collapsed');
	click(container, '[data-name]');
	await expect.poll(() => text(container, '[data-label]')).toBe('wide open');
});
