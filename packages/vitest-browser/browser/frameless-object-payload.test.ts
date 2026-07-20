import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import App from './fixtures/frameless-object-payload.tsrx';

afterEach(() => cleanup());

test('object callback payload crosses child composition after a Chromium click', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const button = container.querySelector<HTMLButtonElement>('[data-object-payload-send]');
	const output = container.querySelector<HTMLOutputElement>('[data-object-payload-value]');
	if (!button || !output) throw new Error('Expected the payload button and output.');

	expect(output.textContent).toBe('0');
	button.click();
	await expect.poll(() => output.textContent).toBe('1');
});
