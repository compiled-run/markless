import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Vote from './row-calls-component-function/vote.tsrx';

// A row's text calls a function its component declares, so every row reads the whole list through it.

afterEach(cleanup);

const errors: unknown[] = [];
addEventListener('error', (event) => errors.push(event.error ?? event.message));
addEventListener('unhandledrejection', (event) => errors.push(event.reason));

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const votes = () =>
	[...document.querySelectorAll('[data-options] b')].map((cell) => cell.textContent);

async function crown() {
	errors.length = 0;
	expect(votes()).toEqual(['0', '0']);
	click('[data-options] li:nth-child(2) button');
	await expect.poll(votes).toEqual(['0', '1 👑']);
	await expect.poll(() => document.querySelector('[data-lead]')!.textContent).toBe('Lead: Sushi');
	click('[data-options] li:nth-child(1) button');
	click('[data-options] li:nth-child(1) button');
	await expect.poll(votes).toEqual(['2 👑', '1']);
	expect(errors).toEqual([]);
}

test('CSR: a row text calling a function of its component follows every write', async () => {
	await render(Vote);
	await crown();
});

test('SSR resume: a row text calling a function of its component follows every write', async () => {
	await renderSSR(Vote);
	await crown();
});
