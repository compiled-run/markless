import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import OpenPanel from './branch-state/open-panel.tsrx';
import NestedPanel from './branch-state/nested-panel.tsrx';
import Panel from './branch-state/panel.tsrx';

// Spec 01 "Conditional identity": state() declared inside an @if arm is disposed with the arm
// and starts fresh from its starting value each time the arm opens.
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

const note = (root: ParentNode) => root.querySelector('[data-note]')?.textContent ?? null;

// The arm is open at load, so the served markup carries the starting value; an object value
// is edited in place and still comes back fresh.
async function openArmStateIsServedThenReset(root: ParentNode) {
	const toggle = root.querySelector<HTMLElement>('[data-toggle]')!;
	expect(note(root)).toBe('draft 0');
	root.querySelector<HTMLElement>('[data-edit]')!.click();
	await expect.poll(() => note(root)).toBe('edited 1');
	root.querySelector<HTMLElement>('[data-edit]')!.click();
	await expect.poll(() => note(root)).toBe('edited 2');
	toggle.click();
	await expect.poll(() => root.querySelector('[data-hidden]')?.textContent).toBe('Hidden');
	expect(note(root)).toBeNull();
	toggle.click();
	await expect.poll(() => note(root)).toBe('draft 0');
	root.querySelector<HTMLElement>('[data-edit]')!.click();
	await expect.poll(() => note(root)).toBe('edited 1');
}

test('CSR: an arm open at load serves its state and resets it on reopen', async () => {
	await openArmStateIsServedThenReset((await render(OpenPanel)).container);
});

test('SSR: an arm open at load serves its state and resets it on reopen', async () => {
	await openArmStateIsServedThenReset((await renderSSR(OpenPanel)).container);
});

const likes = (root: ParentNode) => root.querySelector('[data-likes]')?.textContent ?? null;

// The inner arm is rebuilt by the outer arm's flip, not by its own, so the outer opening restarts it too.
async function innerArmStateStartsFreshWhenTheOuterArmReopens(root: ParentNode) {
	const expand = root.querySelector<HTMLElement>('[data-expand]')!;
	expect(likes(root)).toBe('0');
	root.querySelector<HTMLElement>('[data-likes]')!.click();
	await expect.poll(() => likes(root)).toBe('1');
	expand.click();
	await expect.poll(() => likes(root)).toBeNull();
	expand.click();
	await expect.poll(() => likes(root)).toBe('0');
	root.querySelector<HTMLElement>('[data-likes]')!.click();
	await expect.poll(() => likes(root)).toBe('1');
}

test('CSR: state() in an @if nested in another @if arm starts fresh when the outer arm reopens', async () => {
	await innerArmStateStartsFreshWhenTheOuterArmReopens((await render(NestedPanel)).container);
});

test('SSR: state() in an @if nested in another @if arm starts fresh when the outer arm reopens', async () => {
	await innerArmStateStartsFreshWhenTheOuterArmReopens((await renderSSR(NestedPanel)).container);
});
