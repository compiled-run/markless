import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import BodyFunctionCalls from './body-function-page.tsrx';

afterEach(cleanup);

const shown = () => {
	const label = document.querySelector('[data-label]')!;
	return [
		label.textContent,
		label.getAttribute('title'),
		document.querySelector('[data-scaled]')!.textContent,
		document.querySelector('[data-loud]')!.textContent,
	];
};

async function callsFollowTheirState() {
	expect(shown()).toEqual(['n=1', 'n=1', '20', 'N=1']);
	document.querySelector<HTMLElement>('[data-bump]')!.click();
	await expect.poll(shown).toEqual(['n=2', 'n=2', '40', 'N=2']);
	// `scaled` reads `step` from its own body, not from its arguments.
	document.querySelector<HTMLElement>('[data-step]')!.click();
	await expect.poll(shown).toEqual(['n=2', 'n=2', '400', 'N=2']);
}

test('CSR: a function declared in the component body, called in markup or a computed(), follows the state it reads', async () => {
	await render(BodyFunctionCalls);
	await callsFollowTheirState();
});

test('SSR: a function declared in the component body, called in markup or a computed(), follows the state it reads', async () => {
	await renderSSR(BodyFunctionCalls);
	await callsFollowTheirState();
});
