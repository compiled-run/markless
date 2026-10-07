import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSRIslands } from '../src/index.ts';
import { App } from './fixtures/resume-dispatch-order.tsrx';

afterEach(() => cleanup());

// The composed MDX route queues every gesture through one FIFO per root; the
// island page the multi-embed batteries mount must keep the same order, or a
// press and its release can reach their handlers swapped while the page boots.
function typeThenBackspace(field: HTMLInputElement): void {
	field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
	field.dispatchEvent(new Event('input', { bubbles: true }));
	field.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
	field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
	field.dispatchEvent(new Event('input', { bubbles: true }));
	field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true }));
}

const BURST_TRAIL = 'down:a in:a up:a down:Backspace in: up:Backspace ';
const MOUNTS = 8;

test('SSR islands: a gesture burst that boots the page runs its handlers in arrival order', async () => {
	for (let mount = 0; mount < MOUNTS; mount++) {
		await renderSSRIslands([App, App]);
		const field = document.querySelector<HTMLInputElement>('input[data-field]');
		const trail = document.querySelector<HTMLOutputElement>('output[data-trail]');
		if (!field || !trail)
			throw new Error('Expected the first island to render its field and trail.');

		typeThenBackspace(field);
		await expect.poll(() => trail.textContent?.split(' ').filter(Boolean).length).toBe(6);
		expect(trail.textContent).toBe(BURST_TRAIL);
		expect(field.value).toBe('');
		await cleanup();
	}
});
