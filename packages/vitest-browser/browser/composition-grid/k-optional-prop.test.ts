import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import OptionalPropPage from './k-optional-prop-page.tsrx';

// A child from another file whose handler reads an optional object prop behind a guard and after an early return, rendered with and without it.
afterEach(cleanup);

const said = () =>
	[...document.querySelectorAll('[data-g="said"]')].map((line) => line.textContent);

async function eachInstanceSaysItsOwn() {
	await expect.poll(said).toEqual(['', '']);
	const [leftOut, passed] = document.querySelectorAll<HTMLButtonElement>('main [data-say]');
	leftOut!.click();
	await expect.poll(said).toEqual(['none', '']);
	passed!.click();
	await expect.poll(said).toEqual(['none', 'Ada']);
	const [leftOutShout, passedShout] = document.querySelectorAll<HTMLButtonElement>('main [data-shout]');
	leftOutShout!.click();
	await expect.poll(said).toEqual(['nobody', 'Ada']);
	passedShout!.click();
	await expect.poll(said).toEqual(['nobody', 'ADA']);
}

test('CSR', async () => {
	await render(OptionalPropPage);
	await eachInstanceSaysItsOwn();
});

test('SSR', async () => {
	await renderSSR(OptionalPropPage);
	await eachInstanceSaysItsOwn();
});
