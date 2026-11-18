import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import FocusList from './focus-list.tsrx';
import FocusEditor from './focus-editor.tsrx';
import FocusNote from './focus-note.tsrx';
import * as list from './fetch-list.ts';
import * as title from './fetch-title.ts';

afterEach(cleanup);
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();
const items = () => [...document.querySelectorAll('li')].map((item) => item.firstChild?.textContent?.trim());
const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

async function answered(source: { readonly answers: number }, action: () => void) {
	const before = source.answers;
	action();
	await expect.poll(() => source.answers).toBeGreaterThan(before);
	await frame();
}

async function listKeepsFocus() {
	await expect.poll(items).toEqual(['apple', 'banana', 'grape']);
	const edit = document.querySelectorAll<HTMLButtonElement>('[data-edit]')[1]!;
	edit.focus();
	await answered(list, () => click('[data-refresh]'));
	expect(document.activeElement).toBe(edit);
	click('[data-fail]');
	await expect.poll(() => document.querySelector('[data-error]')?.textContent).toContain('offline');
	expect(items()).toEqual(['apple', 'banana', 'grape']);
	expect(document.activeElement).toBe(edit);
	click('[data-recover]');
	await expect.poll(() => document.querySelector('[data-error]')).toBeNull();
	expect(items()).toEqual(['apple', 'banana', 'grape']);
	expect(document.activeElement).toBe(edit);
}

const head = () => document.querySelector('[data-head]')?.textContent?.replace(/\s+/g, ' ').trim();

async function headerKeepsFocus() {
	click('[data-open]');
	await expect.poll(head).toBe('Back Editing "todo 3 v0" (#3)');
	const back = document.querySelector<HTMLButtonElement>('[data-back]')!;
	back.focus();
	await answered(title, () => click('[data-fail]'));
	expect(head()).toBe('Back Editing "todo 3 v0" (#3)');
	expect(document.activeElement).toBe(back);
	await answered(title, () => click('[data-recover]'));
	await answered(title, () => click('[data-refresh]'));
	await expect.poll(head).toBe('Back Editing "todo 3 v1" (#3)');
	expect(document.activeElement).toBe(back);
}

async function noteKeepsTypedText() {
	await expect.poll(() => document.querySelector('[data-heading]')?.textContent).toBe('todo 7 v0');
	const note = document.querySelector<HTMLInputElement>('[data-note]')!;
	note.focus();
	note.value = 'half a sentence';
	note.setSelectionRange(4, 6);
	await answered(title, () => click('[data-offline]'));
	await expect.poll(() => document.querySelector('[data-offline-note]')?.textContent).toBe('offline');
	expect(document.activeElement).toBe(note);
	await answered(title, () => click('[data-online]'));
	await expect.poll(() => document.querySelector('[data-offline-note]')).toBeNull();
	await answered(title, () => click('[data-bump]'));
	await expect.poll(() => document.querySelector('[data-heading]')?.textContent).toBe('todo 7 v1');
	expect(document.querySelector('[data-note]')).toBe(note);
	expect(document.activeElement).toBe(note);
	expect([note.value, note.selectionStart, note.selectionEnd]).toEqual(['half a sentence', 4, 6]);
}

test('CSR: a focused row button in a @try keeps focus through a refresh, a failed refresh and the recovery', async () => {
	await render(FocusList);
	await listKeepsFocus();
});

test('SSR: a focused row button in a @try keeps focus through a refresh, a failed refresh and the recovery', async () => {
	await renderSSR(FocusList);
	await listKeepsFocus();
});

test('CSR: a focused button in a @try with an empty @catch keeps focus through a failed refresh and the recovery', async () => {
	await render(FocusEditor);
	await headerKeepsFocus();
});

test('SSR: a focused button in a @try with an empty @catch keeps focus through a failed refresh and the recovery', async () => {
	await renderSSR(FocusEditor);
	await headerKeepsFocus();
});

test('CSR: an input in a @try keeps focus, caret and typed text through a failed refresh and the recovery', async () => {
	await render(FocusNote);
	await noteKeepsTypedText();
});

test('SSR: an input in a @try keeps focus, caret and typed text through a failed refresh and the recovery', async () => {
	await renderSSR(FocusNote);
	await noteKeepsTypedText();
});
