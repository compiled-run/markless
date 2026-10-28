import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import BranchRowsPage from './branch-rows-page.tsrx';
import FlipRowsPage from './flip-rows-page.tsrx';

// A nested row that IS an @if is still one element, so the row around it can be built in the browser.
afterEach(() => cleanup());

function type(container: HTMLElement, value: string) {
	const input = container.querySelector<HTMLInputElement>('#q')!;
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

const list = (container: HTMLElement) =>
	container.querySelector('#list')!.innerHTML.replace(/<!--[^>]*-->/g, '');

async function checkBranchRows(container: HTMLElement) {
	type(container, 'a');
	await expect.poll(() => list(container)).toBe('<li><mark>x</mark><span>y</span></li>');
	type(container, '');
	await expect.poll(() => list(container)).toBe('');
	type(container, 'b');
	await expect.poll(() => list(container)).toBe('<li><mark>x</mark><span>y</span></li>');
}

async function checkFlipRows(container: HTMLElement) {
	expect(list(container)).toBe('<li><mark>x</mark><span>y</span></li>');
	type(container, 'b');
	await expect.poll(() => list(container)).toBe('<li><span>x</span><mark>y</mark></li>');
	type(container, '');
	await expect.poll(() => list(container)).toBe('');
	type(container, 'a');
	await expect.poll(() => list(container)).toBe('<li><mark>x</mark><span>y</span></li>');
	type(container, 'c');
	await expect.poll(() => list(container)).toBe('<li><span>x</span><mark>y</mark></li>');
}

test('SSR: an outer list empty on the server builds rows whose nested rows are each an @if', async () => {
	await checkBranchRows((await renderSSR(BranchRowsPage)).container as HTMLElement);
});

test('CSR: an outer list empty at first builds rows whose nested rows are each an @if', async () => {
	await checkBranchRows((await render(BranchRowsPage)).container as HTMLElement);
});

test('SSR: nested rows that are each an @if keep flipping after their outer row is removed and rebuilt', async () => {
	await checkFlipRows((await renderSSR(FlipRowsPage)).container as HTMLElement);
});

test('CSR: nested rows that are each an @if keep flipping after their outer row is removed and rebuilt', async () => {
	await checkFlipRows((await render(FlipRowsPage)).container as HTMLElement);
});
