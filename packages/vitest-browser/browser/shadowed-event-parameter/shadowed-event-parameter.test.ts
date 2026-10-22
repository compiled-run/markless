import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './sep-page.tsrx';

afterEach(cleanup);

// The shared method's own `next` reaches the consumer, not the click event the handler names `next`.
async function pickSendsTheMethodValue() {
	document.querySelector<HTMLButtonElement>('[data-pick]')!.click();
	await expect.poll(() => document.querySelector('output')?.textContent).toBe('aclick!');
	expect(document.querySelector('[data-pick]')?.textContent).toBe('aclick!');
}

test('CSR: a method local named like the handler parameter keeps its own value', async () => {
	await render(Page);
	await pickSendsTheMethodValue();
});

test('SSR: a method local named like the handler parameter keeps its own value', async () => {
	await renderSSR(Page);
	await pickSendsTheMethodValue();
});
