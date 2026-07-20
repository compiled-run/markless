import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import App from './fixtures/f5-parent.tsrx';

afterEach(() => cleanup());

test('F5: an imported child used as the sole template root mounts in Chromium', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const child = container.querySelector<HTMLElement>('[data-f5-child]');

	expect(child?.textContent).toBe('Imported child rendered');
	expect(container.innerHTML).toContain('data-f5-child');
});
