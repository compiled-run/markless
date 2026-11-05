import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import BareRows from './bare-rows.tsrx';
import BranchArm from './branch-arm.tsrx';
import BranchBare from './branch-bare.tsrx';
import ChildProp from './child-prop.tsrx';
import NestedTry from './nested-try.tsrx';
import UserPage from './user-page.tsrx';
import UserPageSplit from './user-page-split.tsrx';

afterEach(cleanup);

// Each load waits on a timer-backed fetch, so a loaded machine gets room to answer.
const LOADS = { timeout: 5_000 };
const textOf = (selector: string) => document.querySelector(selector)?.textContent ?? '';
const all = (selector: string) => [...document.querySelectorAll(selector)];
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

function focusField(): HTMLElement {
	const field = document.querySelector('[data-field]') as HTMLInputElement;
	field.focus();
	field.value = 'typed';
	return field;
}

function kept(before: ReadonlyArray<Element>, field: HTMLElement) {
	for (const element of before) expect(element.isConnected).toBe(true);
	expect(document.activeElement).toBe(field);
	if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
		expect(field.value).toBe('typed');
}

async function branchArmFlipsOnlyWhenItsConditionChanges(
	heading: string,
	badgeText: string,
	plain: string,
) {
	await expect.poll(() => textOf(heading), LOADS).toBe('account 0');
	const head = document.querySelector(heading)!;
	const regular = document.querySelector(plain);
	const field = focusField();
	click('[data-again]');
	await expect.poll(() => textOf(heading), LOADS).toBe('account 1');
	kept([head, ...(regular ? [regular] : [])], field);
	if (regular) expect(regular.textContent).toBe('regular account 1');
	expect(document.querySelector('[data-badge]')).toBe(null);
	click('[data-again]');
	await expect.poll(() => textOf('[data-badge]'), LOADS).toBe(badgeText);
	kept([head], field);
	expect(document.querySelector(plain)).toBe(null);
	if (regular) expect(regular.isConnected).toBe(false);
}

test('CSR: a refresh keeps an arm holding an @if, flipping the @if only when its condition changes', async () => {
	await render(BranchArm);
	await branchArmFlipsOnlyWhenItsConditionChanges('h3', 'vip account 2', '[data-plain]');
});

test('SSR: a refresh keeps an arm holding an @if, flipping the @if only when its condition changes, after resume', async () => {
	await renderSSR(BranchArm);
	await branchArmFlipsOnlyWhenItsConditionChanges('h3', 'vip account 2', '[data-plain]');
});

test('CSR: a refresh keeps a fragment arm holding a one-armed @if', async () => {
	await render(BranchBare);
	await branchArmFlipsOnlyWhenItsConditionChanges('[data-who]', 'gold account 2', '[data-none]');
});

test('SSR: a refresh keeps a fragment arm holding a one-armed @if after resume', async () => {
	await renderSSR(BranchBare);
	await branchArmFlipsOnlyWhenItsConditionChanges('[data-who]', 'gold account 2', '[data-none]');
});

async function childKeepsItsElements() {
	await expect.poll(() => textOf('[data-label]'), LOADS).toBe('account 0');
	const badge = document.querySelector('[data-badge]')!;
	const field = focusField();
	click('[data-again]');
	await expect.poll(() => textOf('[data-label]'), LOADS).toBe('account 1');
	expect(badge.getAttribute('title')).toBe('account 1');
	expect(textOf('small')).toBe('1');
	kept([badge], field);
	click('[data-say]');
	await expect.poll(() => textOf('output'), LOADS).toBe('account 1');
}

test('CSR: a refresh keeps a child component and hands it the new prop value', async () => {
	await render(ChildProp);
	await childKeepsItsElements();
});

test('SSR: a refresh keeps a child component and hands it the new prop value after resume', async () => {
	await renderSSR(ChildProp);
	await childKeepsItsElements();
});

const notes = () => all('[data-note]').map((note) => note.textContent?.trim());

async function nestedTrySettlesOnItsOwn() {
	await expect.poll(notes, LOADS).toEqual(['note a0', 'note b0']);
	await expect.poll(() => textOf('h2'), LOADS).toBe('account 0');
	const head = document.querySelector('h2')!;
	const rows = all('[data-note]');
	const field = focusField();
	click('[data-again]');
	await expect.poll(notes, LOADS).toEqual(['note a1', 'note b1', 'note c1']);
	await expect.poll(() => textOf('h2'), LOADS).toBe('account 1');
	expect(all('[data-note]').slice(0, 2)).toEqual(rows);
	kept([head, ...rows], field);
}

test('CSR: a refresh keeps an arm holding a nested @try and the nested rows', async () => {
	await render(NestedTry);
	await nestedTrySettlesOnItsOwn();
});

test('SSR: a refresh keeps an arm holding a nested @try and the nested rows after resume', async () => {
	await renderSSR(NestedTry);
	await nestedTrySettlesOnItsOwn();
});

async function bareRowsKeepTheirElements() {
	await expect.poll(notes, LOADS).toEqual(['note a0', 'note b0']);
	const rows = all('[data-note]');
	const field = rows[1]!.querySelector('input') as HTMLInputElement;
	field.focus();
	field.value = 'typed';
	click('[data-again]');
	await expect.poll(notes, LOADS).toEqual(['note a1', 'note b1', 'note c1']);
	expect(all('[data-note]').slice(0, 2)).toEqual(rows);
	kept(rows, field);
}

test('CSR: a refresh keeps rows written straight into the @try', async () => {
	await render(BareRows);
	await bareRowsKeepTheirElements();
});

test('SSR: a refresh keeps rows written straight into the @try after resume', async () => {
	await renderSSR(BareRows);
	await bareRowsKeepTheirElements();
});

const titles = () => all('li').map((post) => post.textContent);

async function pageKeepsEverything() {
	await expect.poll(() => textOf('h1'), LOADS).toBe('user ada r0');
	await expect.poll(titles, LOADS).toEqual(['ada first', 'ada second']);
	expect(textOf('h2')).toBe('2 new posts');
	const [h1, h2, select] = [
		document.querySelector('h1')!,
		document.querySelector('h2')!,
		document.querySelector('select')!,
	];
	const posts = all('li');
	select.focus();
	click('[data-again]');
	await expect.poll(() => textOf('h1'), LOADS).toBe('user ada r1');
	kept([h1, h2, select, ...posts], select);
	expect(all('li')).toEqual(posts);
	select.value = 'top';
	select.dispatchEvent(new Event('change', { bubbles: true }));
	await expect.poll(titles, LOADS).toEqual(['ada second', 'ada first']);
	await expect.poll(() => textOf('h2'), LOADS).toBe('2 top posts');
	expect(document.querySelector('h1')).toBe(h1);
	expect(document.querySelector('select')).toBe(select);
	expect(document.activeElement).toBe(select);
	for (const post of posts) expect(post.isConnected).toBe(true);
}

test('CSR: a refresh keeps the whole user page: header, picker and the nested post list', async () => {
	await render(UserPage);
	await pageKeepsEverything();
});

test('CSR: a refresh keeps the user page whose posts heading sits in the posts block', async () => {
	await render(UserPageSplit);
	await pageKeepsEverything();
});

test('SSR: a refresh keeps the user page whose posts heading sits in the posts block, after resume', async () => {
	await renderSSR(UserPageSplit);
	await pageKeepsEverything();
});
