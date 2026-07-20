import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import App from './fixtures/frameless-aliased-prop-parent.tsrx';

afterEach(() => cleanup());

test('an aliased prop receives its authored key through an imported child', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const child = container.querySelector<HTMLElement>('[data-aliased-prop-child]');

	expect(child?.textContent).toBe('authored key delivered');
});
