import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ObjectArgumentPage from './k-object-argument-page.tsrx';

// An attribute calling a function with object and array literals built from an async value follows each new value.
afterEach(cleanup);

const link = () => {
	const anchor = document.querySelector('[data-g="link"]');
	return `${anchor?.getAttribute('href')} ${anchor?.getAttribute('title')}`;
};

async function theLinkFollowsTheValue() {
	await expect.poll(link).toBe('/items/a0/edit x t0 end');
	const next = document.querySelector<HTMLButtonElement>('main button')!;
	next.click();
	await expect.poll(link).toBe('/items/a1/edit x t1 end');
	next.click();
	await expect.poll(link).toBe('/items/a2/edit x t2 end');
}

test('CSR', async () => {
	await render(ObjectArgumentPage);
	await theLinkFollowsTheValue();
});

test('SSR', async () => {
	await renderSSR(ObjectArgumentPage);
	await theLinkFollowsTheValue();
});
