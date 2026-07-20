import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import App from './fixtures/frameless-object-payload.tsrx';

afterEach(() => cleanup());

// Known gap (F9, goals/frameless-compiler-claims/notes/T003c-f9-scoping.md): child-prop
// reads inside lazy handler symbols route to the page prop:props cell, so the composed
// callback is not callable at runtime. Fixing it needs a per-instance prop/callback
// routing contract (owner design decision). `.fails` flips this red the day it works.
test.fails('object callback payload crosses child composition after a Chromium click', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	const button = container.querySelector<HTMLButtonElement>('[data-object-payload-send]');
	const output = container.querySelector<HTMLOutputElement>('[data-object-payload-value]');
	if (!button || !output) throw new Error('Expected the payload button and output.');

	expect(output.textContent).toBe('0');
	button.click();
	await expect.poll(() => output.textContent).toBe('1');
});
