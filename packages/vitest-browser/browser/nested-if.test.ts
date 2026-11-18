import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Greeting from './nested-if/greeting.tsrx';

// An @if directly inside another @if's arm keeps re-deciding on its own test while the outer arm is shown,
// and comes back decided from the current values each time the outer arm reopens.
afterEach(() => cleanup());

const greeting = (root: ParentNode) =>
	[...root.querySelectorAll('[data-greeting]')].map((p) => p.textContent);

async function innerBranchFollowsItsTest(root: ParentNode) {
	const open = root.querySelector<HTMLElement>('[data-open]')!;
	const sign = root.querySelector<HTMLElement>('[data-sign]')!;
	expect(root.querySelector('[data-panel]')).toBeNull();
	open.click();
	await expect.poll(() => greeting(root)).toEqual(['Sign in to comment']);
	sign.click();
	await expect.poll(() => greeting(root)).toEqual(['Welcome back']);
	sign.click();
	await expect.poll(() => greeting(root)).toEqual(['Sign in to comment']);
	sign.click();
	await expect.poll(() => greeting(root)).toEqual(['Welcome back']);
	open.click();
	await expect.poll(() => root.querySelector('[data-panel]')).toBeNull();
	sign.click();
	open.click();
	await expect.poll(() => greeting(root)).toEqual(['Sign in to comment']);
	sign.click();
	await expect.poll(() => greeting(root)).toEqual(['Welcome back']);
}

test('CSR: an @if inside an @if arm follows its own test', async () => {
	await innerBranchFollowsItsTest((await render(Greeting)).container);
});

test('SSR: an @if inside an @if arm follows its own test', async () => {
	await innerBranchFollowsItsTest((await renderSSR(Greeting)).container);
});
