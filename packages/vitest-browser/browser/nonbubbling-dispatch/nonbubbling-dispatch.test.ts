import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './page.tsrx';

// `pointerenter` does not bubble, but the container's one capture listener is
// handed each descendant's own copy. Only the element that declared the handler
// answers; every other element the pointer crosses passes through silently.
afterEach(() => cleanup());

const Background = page.getByTestId('background');
const LabelAlpha = page.getByTestId('label-alpha');
const Entries = page.getByTestId('entries');
const Chosen = page.getByTestId('chosen');

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

function entriesCount(): number {
	return Number(Entries.element().textContent);
}

async function expectHoverPassesThrough(): Promise<void> {
	// A mount under a resting cursor can enter the list before the walk starts,
	// so each step is measured against the count the step before it left.
	await userEvent.hover(Background);
	const settled = entriesCount();

	// A real pointer reaching the deepest label crosses the list, an option and
	// the label: the list's own handler answers once, the descendants not at all.
	await userEvent.hover(LabelAlpha);
	// Greater-than, not exactly one: an SSR page resuming inside the demand-load
	// window can replay the same enter, which is a separate matter from routing.
	await expect.poll(entriesCount).toBeGreaterThan(settled);

	// Bubbling events still route from a descendant to the record above it.
	await userEvent.click(LabelAlpha);
	await expect.element(Chosen).toHaveTextContent('alpha');
}

test('CSR: a real pointer over plain descendants raises no unmatched dispatch', async () => {
	const thrown = watchForThrows();
	try {
		await render(Page);
		await expectHoverPassesThrough();
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: a resumed page takes the same pointer walk without an unmatched dispatch', async () => {
	const thrown = watchForThrows();
	try {
		await renderSSR(Page);
		await expectHoverPassesThrough();
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});
