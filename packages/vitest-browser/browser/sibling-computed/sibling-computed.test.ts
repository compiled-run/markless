import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import SiblingComputedPage from './page.tsrx';

// A factory computed that composes a sibling computed. computed() answers with
// the derived VALUE, so the sibling is read by name and the lowering rewrites
// that name into a read of the sibling's cell - a local off the state map while
// the page is served, `context.graph.read(...)` in the browser. Spelled as a
// call instead, both emissions applied the parentheses to the derived value and
// threw a TypeError, so a text assertion alone would not have caught it: the
// error watch below is the load-bearing half.
afterEach(() => cleanup());

const QUIET = {
	raw: 'quiet',
	loud: 'QUIET',
	banged: 'QUIET!',
	asked: 'QUIET!?',
	shouted: 'QUIET!QUIET!',
};

const LOUDER = {
	raw: 'louder',
	loud: 'LOUDER',
	banged: 'LOUDER!',
	asked: 'LOUDER!?',
	shouted: 'LOUDER!LOUDER!',
};

async function expectChain(container: ParentNode, want: typeof QUIET) {
	for (const [mark, text] of Object.entries(want)) {
		await expect
			.poll(() => container.querySelector(`[data-${mark}]`)?.textContent)
			.toBe(text);
	}
}

/** A write re-derives the whole chain in the browser, off the copied expressions. */
async function expectWriteReDerives(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-shout]')?.click();
	await expectChain(container, LOUDER);
}

/**
 * A handler reads a derived cell the same way a derive reads a sibling - by
 * name, off the value the cell already holds. The click is what runs the copied
 * handler text, so it is where a read spelled as a call would throw.
 */
async function expectHandlerReadsValue(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-capture]')?.click();
	await expect.poll(() => container.querySelector('[data-seen]')?.textContent).toBe(QUIET.banged);
}

/** A TypeError raised inside a derive, which no assertion on text would catch. */
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

test('CSR: a chain of sibling-composed cells derives on first render', async () => {
	const thrown = watchForThrows();
	try {
		const screen = await render(SiblingComputedPage);
		await expectChain(screen.container as HTMLElement, QUIET);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('CSR: a write re-derives every cell that reads a sibling', async () => {
	const thrown = watchForThrows();
	try {
		const screen = await render(SiblingComputedPage);
		await expectChain(screen.container as HTMLElement, QUIET);
		await expectWriteReDerives(screen.container as HTMLElement);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('CSR: a handler reading a derived cell writes the value it holds', async () => {
	const thrown = watchForThrows();
	try {
		const screen = await render(SiblingComputedPage);
		await expectChain(screen.container as HTMLElement, QUIET);
		await expectHandlerReadsValue(screen.container as HTMLElement);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR resume: a handler reading a derived cell writes the value it holds', async () => {
	const thrown = watchForThrows();
	try {
		const screen = await renderSSR(SiblingComputedPage);
		await expectChain(screen.container as HTMLElement, QUIET);
		await expectHandlerReadsValue(screen.container as HTMLElement);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: the served HTML already carries the whole chain', async () => {
	const thrown = watchForThrows();
	try {
		const screen = await renderSSR(SiblingComputedPage);
		await expectChain(screen.container as HTMLElement, QUIET);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR resume: a write after resume re-derives the chain in the browser', async () => {
	const thrown = watchForThrows();
	try {
		const screen = await renderSSR(SiblingComputedPage);
		await expectChain(screen.container as HTMLElement, QUIET);
		await expectWriteReDerives(screen.container as HTMLElement);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});
