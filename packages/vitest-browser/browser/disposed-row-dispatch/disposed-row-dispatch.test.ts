import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './page.tsrx';

// Dispatch runs microtasks behind the press it answers, so a second key struck
// before the first one's write lands is delivered holding a row the write then
// removes. The event was live when it fired: it still reaches the record above
// the repeat instead of being refused as an unmatched dispatch.
afterEach(() => cleanup());

const Steps = page.getByTestId('steps');
const Count = page.getByTestId('count');

/** Errors a refused dispatch raises, which no assertion on text would catch. */
function watchForThrows(): { readonly seen: string[]; readonly stop: () => void } {
	const seen: string[] = [];
	const onError = (event: ErrorEvent) => void seen.push(String(event.error ?? event.message));
	const onRejection = (event: PromiseRejectionEvent) => {
		event.preventDefault();
		seen.push(String(event.reason));
	};
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	return {
		seen,
		stop: () => {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
		},
	};
}

async function expectSecondPressLands(): Promise<void> {
	await expect.poll(() => Count.element().textContent, { timeout: 5000 }).toBe('3');
	const held = page.getByTestId('charlie').element();
	held.focus();

	// Both presses in ONE task, which is what makes the measurement deterministic:
	// the row is provably still in the document when the second key is struck, and
	// provably gone by the time that keydown's dispatch reaches the walk.
	const press = () =>
		held.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
	press();
	press();

	await expect.poll(() => Steps.element().textContent, { timeout: 5000 }).toBe('2');
	await expect.poll(() => Count.element().textContent, { timeout: 5000 }).toBe('1');
	expect(held.isConnected).toBe(false);
}

test('CSR: a keydown holding a row the key before it removed still reaches the handler', async () => {
	const thrown = watchForThrows();
	try {
		await render(Page);
		await expectSecondPressLands();
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: a resumed page routes the same keydown without an unmatched dispatch', async () => {
	const thrown = watchForThrows();
	try {
		await renderSSR(Page);
		await expectSecondPressLands();
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});
