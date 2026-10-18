import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './ccr-page.tsrx';

afterEach(cleanup);

const classes = () =>
	[...document.querySelectorAll<HTMLElement>('[data-nav] li')].map(
		(row) => `${row.dataset.href}:${row.className}`,
	);
const steps = () =>
	[...document.querySelectorAll<HTMLElement>('[data-steps] li')].map(
		(row) =>
			`${row.dataset.step}:${row.getAttribute('aria-current') ?? '-'}:${row.textContent?.replace(/\s+/g, ' ').trim()}`,
	);
const picked = () =>
	[...document.querySelectorAll<HTMLElement>('[data-groups] li')].map(
		(row) => `${row.dataset.item}:${row.dataset.picked}`,
	);
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function pinRowsFollowTheirReads() {
	expect(classes()).toEqual(['/:active', '/start-here:idle', '/directives:idle']);
	expect(steps()).toEqual(['one:step:1. one (here)', 'two:-:2. two', 'three:-:3. three']);

	click('[data-go-start]');
	await expect.poll(classes).toEqual(['/:idle', '/start-here:active', '/directives:idle']);
	click('[data-go-directives]');
	await expect.poll(classes).toEqual(['/:idle', '/start-here:idle', '/directives:active']);

	click('[data-next]');
	await expect
		.poll(steps)
		.toEqual(['one:-:1. one', 'two:step:2. two (here)', 'three:-:3. three']);

	expect(picked()).toEqual(['x:no', 'y:no', 'z:no']);
	click('[data-pick-z]');
	await expect.poll(picked).toEqual(['x:no', 'y:no', 'z:yes']);
	await expect.poll(steps).toEqual(['one:-:1. one', 'two:-:2. two', 'three:-:3. three']);
}

test('CSR: rows of a module-constant @for follow the prop and state they read', async () => {
	await render(Page);
	await pinRowsFollowTheirReads();
});

test('SSR: rows of a module-constant @for follow the prop and state they read after resume', async () => {
	await renderSSR(Page);
	await pinRowsFollowTheirReads();
});
