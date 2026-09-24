import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './ncp-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const pick = (label: string) => document.querySelector<HTMLElement>(`[data-pick="${label}"]`)!.click();

async function pinCallbacks() {
	for (const label of ['direct', 'middle', 'local', 'projected', 'forwarded', 'forwarded-direct', 'middle-direct']) pick(label);
	await new Promise((resolve) => setTimeout(resolve, 500));
	expect({
		direct: text('[data-direct-count]'),
		middle: text('[data-middle-count]'),
		local: text('[data-local-count]'),
		projected: text('[data-picked]'),
		forwarded: text('[data-forwarded]'),
		forwardedDirect: text('[data-forwarded-direct]'),
		middleDirect: text('[data-middle-taps]'),
	}).toEqual({
		direct: '1',
		middle: '1',
		local: '1',
		projected: 'projected!',
		forwarded: 'forwarded!',
		forwardedDirect: '1',
		middleDirect: '1',
	});
}

test('CSR: callback props passed by nested children run', async () => {
	await render(Page);
	await pinCallbacks();
});

test('SSR: callback props passed by nested children run', async () => {
	await renderSSR(Page);
	await pinCallbacks();
});
