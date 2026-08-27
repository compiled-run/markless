import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ForeignScopePage from './page.tsrx';

// A page that reads a shared() factory computed defined in another directory.
// The browser re-derives the cell from a copy of the factory's expression, and
// that copy still spells `shout` and `SUFFIX` - names this page's own module
// scope has never heard of. Served HTML was right without the carry, so the
// failure only showed as a ReferenceError on the first client re-derive.
afterEach(() => cleanup());

async function expectDerivedText(container: ParentNode) {
	await expect.poll(() => container.querySelector('[data-loud]')?.textContent).toBe('QUIET!');
	expect(container.querySelector('[data-framed]')?.textContent).toBe('!QUIET!');
}

/** The click re-derives both cells in the browser, off the carried scope. */
async function expectWriteReDerives(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-shout]')?.click();
	await expect.poll(() => container.querySelector('[data-raw]')?.textContent).toBe('louder');
	await expect.poll(() => container.querySelector('[data-loud]')?.textContent).toBe('LOUDER!');
	await expect
		.poll(() => container.querySelector('[data-framed]')?.textContent)
		.toBe('!LOUDER!');
}

/** Errors an unbound name would raise, which no assertion on text would catch. */
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

test('CSR: a foreign factory computed renders from the carried scope', async () => {
	const thrown = watchForThrows();
	try {
		const screen = await render(ForeignScopePage);
		await expectDerivedText(screen.container as HTMLElement);
		await expectWriteReDerives(screen.container as HTMLElement);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: the served text survives resume, and a write re-derives it', async () => {
	const thrown = watchForThrows();
	try {
		const screen = await renderSSR(ForeignScopePage);
		await expectDerivedText(screen.container);
		await expectWriteReDerives(screen.container);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});
