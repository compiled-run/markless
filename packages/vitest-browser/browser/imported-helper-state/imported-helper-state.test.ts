import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './helper-state-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const shown = () => [text('[data-count]'), text('[data-five]'), text('[data-ten]')];

async function eachCounterKeepsItsOwnState() {
	expect(shown()).toEqual(['0', '5', '10']);
	document.querySelector<HTMLElement>('[data-count]')!.click();
	await expect.poll(shown).toEqual(['1', '5', '10']);
	document.querySelector<HTMLElement>('[data-five]')!.click();
	document.querySelector<HTMLElement>('[data-ten]')!.click();
	await expect.poll(shown).toEqual(['1', '6', '11']);
}

test('CSR: state a helper in another .tsrx file creates renders and updates', async () => {
	await render(Page);
	await eachCounterKeepsItsOwnState();
});

test('SSR: state a helper in another .tsrx file creates renders and updates after resume', async () => {
	await renderSSR(Page);
	await eachCounterKeepsItsOwnState();
});
