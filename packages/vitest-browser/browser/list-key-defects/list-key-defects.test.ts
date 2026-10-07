import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ArmOwned from './lkd-arm-owned.tsrx';
import CallbackProp from './lkd-callback-prop.tsrx';
import IndexKeyed from './lkd-index-key.tsrx';
import ProjectedCallback from './lkd-projected-callback.tsrx';
import Resurrect from './lkd-resurrect.tsrx';

afterEach(cleanup);

const rowTexts = () =>
	[...document.querySelectorAll('[data-row]')].map((row) => row.textContent?.trim());
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();
const empties = () => document.querySelectorAll('[data-empty]').length;
const boxes = () => [...document.querySelectorAll<HTMLInputElement>('[data-row] input')];

async function indexKeyedRowsFollowTheArray() {
	expect(rowTexts()).toEqual(['X', 'Y', 'Z']);
	click('[data-reverse]');
	await expect.poll(rowTexts).toEqual(['Z', 'Y', 'X']);
	click('[data-drop]');
	await expect.poll(rowTexts).toEqual(['Z', 'Y']);
	click('[data-grow]');
	await expect.poll(rowTexts).toEqual(['Z', 'Y', 'W']);
	(document.querySelectorAll('[data-row]')[0] as HTMLElement).click();
	await expect.poll(() => document.querySelector('[data-picked]')?.textContent).toBe('Z');
	(document.querySelectorAll('[data-row]')[2] as HTMLElement).click();
	await expect.poll(() => document.querySelector('[data-picked]')?.textContent).toBe('W');
}

test('CSR: index-keyed rows update their text and count when the array is replaced', async () => {
	await render(IndexKeyed);
	await indexKeyedRowsFollowTheArray();
});

test('SSR: index-keyed rows update their text and count when the array is replaced', async () => {
	await renderSSR(IndexKeyed);
	await indexKeyedRowsFollowTheArray();
});

async function reinsertedKeysGetFreshRows() {
	expect(rowTexts()).toEqual(['P', 'Q']);
	const first = document.querySelector('[data-row]');
	boxes()[0]!.click();
	expect(boxes()[0]!.checked).toBe(true);
	click('[data-clear]');
	await expect.poll(rowTexts).toEqual([]);
	await expect.poll(empties).toBe(1);
	click('[data-reset]');
	await expect.poll(rowTexts).toEqual(['P', 'Q']);
	expect(empties()).toBe(0);
	expect(document.querySelector('[data-row]')).not.toBe(first);
	expect(boxes().map((box) => box.checked)).toEqual([false, false]);
	click('[data-swap]');
	await expect.poll(boxes).toEqual([]);
	expect(rowTexts()).toEqual(['P', 'Q']);
	click('[data-clear]');
	await expect.poll(rowTexts).toEqual([]);
	click('[data-reset]');
	await expect.poll(rowTexts).toEqual(['P', 'Q']);
	click('[data-swap]');
	await expect.poll(() => boxes().length).toBe(2);
	expect(rowTexts()).toEqual(['P', 'Q']);
	boxes()[1]!.click();
	click('[data-reverse]');
	await expect.poll(rowTexts).toEqual(['Q', 'P']);
	expect(boxes().map((box) => box.checked)).toEqual([true, false]);
	click('[data-clear]');
	await expect.poll(empties).toBe(1);
	click('[data-swap]');
	await expect.poll(empties).toBe(0);
	click('[data-swap]');
	await expect.poll(empties).toBe(1);
	expect(rowTexts()).toEqual([]);
	click('[data-reset]');
	await expect.poll(rowTexts).toEqual(['P', 'Q']);
	expect(empties()).toBe(0);
}

test('CSR: a keyed row removed and re-added gets fresh DOM and no duplicate after a branch swap', async () => {
	await render(Resurrect);
	await reinsertedKeysGetFreshRows();
});

test('SSR: a keyed row removed and re-added gets fresh DOM and no duplicate after a branch swap', async () => {
	await renderSSR(Resurrect);
	await reinsertedKeysGetFreshRows();
});

async function armOwnedRowsFollowAfterRemount() {
	expect(rowTexts()).toEqual(['P', 'Q']);
	const firstList = document.querySelector('ul');
	click('[data-swap]');
	await expect.poll(rowTexts).toEqual([]);
	click('[data-clear]');
	click('[data-swap]');
	await expect.poll(() => document.querySelectorAll('ul').length).toBe(1);
	expect(rowTexts()).toEqual([]);
	expect(document.querySelector('ul')).not.toBe(firstList);
	click('[data-reset]');
	await expect.poll(rowTexts).toEqual(['P', 'Q']);
	click('[data-clear]');
	await expect.poll(rowTexts).toEqual([]);
}

test('CSR: a repeat inside its own element in an @if arm follows its collection after the arm remounts', async () => {
	await render(ArmOwned);
	await armOwnedRowsFollowAfterRemount();
});

test('SSR: a repeat inside its own element in an @if arm follows its collection after the arm remounts', async () => {
	await renderSSR(ArmOwned);
	await armOwnedRowsFollowAfterRemount();
});

async function callbackPropReadsCurrentState() {
	const count = () => document.querySelector('[data-count]')?.textContent;
	expect(count()).toBe('3');
	click('[data-trigger], [data-act]');
	await expect.poll(count).toBe('2');
	click('[data-trigger], [data-act]');
	await expect.poll(count).toBe('1');
}

test('CSR: a callback prop calling a method on state reads the current value', async () => {
	await render(CallbackProp);
	await callbackPropReadsCurrentState();
});

test('SSR: a callback prop calling a method on state reads the current value', async () => {
	await renderSSR(CallbackProp);
	await callbackPropReadsCurrentState();
});

test('CSR: a block-bodied callback prop passed through projected children reads the current value', async () => {
	await render(ProjectedCallback);
	await callbackPropReadsCurrentState();
});

test('SSR: a block-bodied callback prop passed through projected children reads the current value', async () => {
	await renderSSR(ProjectedCallback);
	await callbackPropReadsCurrentState();
});
