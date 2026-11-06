import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Panel from './branch-state/panel.tsrx';

// Spec 01 "Conditional identity": state() declared inside an @if arm is disposed with the arm
// and starts fresh from its initializer each time the arm opens.
afterEach(() => cleanup());

const draft = (root: ParentNode) => root.querySelector('[data-draft]')?.textContent ?? null;

async function branchStateStartsFresh(root: ParentNode) {
	const toggle = root.querySelector<HTMLElement>('[data-toggle]')!;
	expect(draft(root)).toBeNull();
	toggle.click();
	await expect.poll(() => draft(root)).toBe('0');
	root.querySelector<HTMLElement>('[data-draft]')!.click();
	await expect.poll(() => draft(root)).toBe('1');
	root.querySelector<HTMLElement>('[data-draft]')!.click();
	await expect.poll(() => draft(root)).toBe('2');
	toggle.click();
	await expect.poll(() => draft(root)).toBeNull();
	toggle.click();
	await expect.poll(() => draft(root)).toBe('0');
	root.querySelector<HTMLElement>('[data-draft]')!.click();
	await expect.poll(() => draft(root)).toBe('1');
}

test('CSR: state() inside an @if arm starts fresh each time the arm opens', async () => {
	await branchStateStartsFresh((await render(Panel)).container);
});

test('SSR: state() inside an @if arm starts fresh each time the arm opens', async () => {
	await branchStateStartsFresh((await renderSSR(Panel)).container);
});
