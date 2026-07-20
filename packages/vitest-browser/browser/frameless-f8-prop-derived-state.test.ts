import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import App from './fixtures/f8-parent.tsrx';

afterEach(() => cleanup());

test('F8: imported child prop-derived state updates after a Chromium click', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const button = container.querySelector<HTMLButtonElement>('[data-f8-count]');
	if (!button) throw new Error('Expected the imported child button in the mounted DOM.');

	expect(button.textContent).toBe('2');
	button.click();
	await expect.poll(() => button.textContent).toBe('3');
});
