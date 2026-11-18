import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import CatchErrorPropPage from './k-catch-error-prop-page.tsrx';
import CatchErrorSameFilePage from './k-catch-error-same-file-page.tsrx';

// `@catch (error)` passes `error.message` to a component; each failure shows its own message, after the kept answer once there is one.
afterEach(cleanup);

const shown = () =>
	[...document.querySelectorAll<HTMLElement>('[data-g]')].map(
		(line) => `${line.dataset.g}: ${line.textContent}`,
	);

async function eachFailureShowsItsMessage() {
	await expect.poll(shown).toEqual(['oops: Not Found 0']);
	const next = document.querySelector<HTMLButtonElement>('main button')!;
	next.click();
	await expect.poll(shown).toEqual(['loaded: found 1']);
	next.click();
	await expect.poll(shown).toEqual(['loaded: found 1', 'oops: Not Found 2']);
	next.click();
	await expect.poll(shown).toEqual(['loaded: found 3']);
	next.click();
	await expect.poll(shown).toEqual(['loaded: found 3', 'oops: Not Found 4']);
}

test('CSR', async () => {
	await render(CatchErrorPropPage);
	await eachFailureShowsItsMessage();
});

test('SSR', async () => {
	await renderSSR(CatchErrorPropPage);
	await eachFailureShowsItsMessage();
});

test('same file: CSR', async () => {
	await render(CatchErrorSameFilePage);
	await eachFailureShowsItsMessage();
});

test('same file: SSR', async () => {
	await renderSSR(CatchErrorSameFilePage);
	await eachFailureShowsItsMessage();
});
