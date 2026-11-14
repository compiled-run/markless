import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import CatchErrorCasesPage from './k-catch-error-cases-page.tsrx';

// error.name, two different failures in a row while @catch stays shown, and a nested @try, each read by a component.
afterEach(cleanup);

const shown = () =>
	[...document.querySelectorAll<HTMLElement>('[data-g]')].map(
		(line) => `${line.dataset.g}: ${line.textContent}`,
	);
const press = (button: string) => document.querySelector<HTMLButtonElement>(`[data-${button}]`)!.click();

async function eachComponentFollowsItsError() {
	await expect.poll(shown).toEqual([
		'oops: TypeError',
		'oops: first 0',
	]);
	press('next');
	await expect.poll(shown).toEqual([
		'oops: RangeError',
		'oops: second 1',
	]);
	press('next');
	await expect.poll(shown).toEqual(['loaded: found 2', 'inner: inner ok 0']);
	press('inner');
	await expect.poll(shown).toEqual(['loaded: found 2', 'inner: inner ok 0', 'oops: inner 1']);
	press('inner');
	await expect.poll(shown).toEqual(['loaded: found 2', 'inner: inner ok 2']);
	press('inner');
	await expect.poll(shown).toEqual(['loaded: found 2', 'inner: inner ok 2', 'oops: inner 3']);
}

test('CSR', async () => {
	await render(CatchErrorCasesPage);
	await eachComponentFollowsItsError();
});

test('SSR', async () => {
	await renderSSR(CatchErrorCasesPage);
	await eachComponentFollowsItsError();
});
