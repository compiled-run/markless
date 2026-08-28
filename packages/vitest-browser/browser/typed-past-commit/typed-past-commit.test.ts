import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import TypedPastCommitPage from './typed-past-commit-page.tsrx';

// A dispatch is asynchronous, so a person typing fast lands more keystrokes
// between the handler reading the field and the commit writing the bound `value`
// back onto it. Writing the handler's answer over them rewinds the field to text
// from several keystrokes ago, and every event queued behind it then reads the
// rewound text - so the rest of the run is swallowed and never reaches a handler
// at all.

afterEach(async () => {
	await cleanup();
});

const field = () => page.getByTestId('field').element() as HTMLInputElement;
const shown = () => page.getByTestId('text').element().textContent;

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a run typed while the commit is in flight keeps every keystroke`, async () => {
		if (mode === 'CSR') await render(TypedPastCommitPage);
		else await renderSSR(TypedPastCommitPage);

		field().focus();
		await userEvent.keyboard('a');
		await expect.poll(() => shown(), { timeout: 5000 }).toBe('a');

		// The rest of the run lands while the dispatch for `b` is still waiting to
		// commit, which is the whole subject: the commit must not take the field
		// back to what `b` read.
		await userEvent.keyboard('bcdefgh');
		await expect.poll(() => field().value, { timeout: 5000 }).toBe('abcdefgh');
		await expect.poll(() => shown(), { timeout: 5000 }).toBe('abcdefgh');
	});
}
