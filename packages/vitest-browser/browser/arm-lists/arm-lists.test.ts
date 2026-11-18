import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import PlainIf from './plain-if.tsrx';
import SwitchArm from './switch-arm.tsrx';
import ComponentRows from './component-rows.tsrx';
import NestedArms from './nested-arms.tsrx';
import RowArms from './row-arms.tsrx';
import DeepPage from './deep-page.tsrx';
import TryChildIf from './try-child-if.tsrx';
import TryRowIf from './try-row-if.tsrx';
import EscalatedPage from './escalated-page.tsrx';
import TryPlainIf from './try-plain-if.tsrx';
import ChildList from './child-list.tsrx';

// A list inside an arm follows its data after the arm opens late, closes, and reopens over data changed while closed.
afterEach(cleanup);

const poll = { timeout: 2_000 };
const rows = () => Array.from(document.querySelectorAll('[data-list] li'), (row) => row.textContent?.trim());
const press = (name: string) => userEvent.click(document.querySelector<HTMLElement>(`[data-${name}]`)!);
const notes = (count: number) => ['a', 'b', 'c', 'd'].slice(0, count).map((id) => `note ${id}`);

// Every fixture starts with no notes and its arm shut; `opensOnFirst` says whether More alone opens it.
async function followsItsData(opensOnFirst: boolean) {
	expect(rows()).toEqual([]);
	if (!opensOnFirst) await press('toggle');
	await press('more');
	await expect.poll(rows, poll).toEqual(notes(1));
	await press('more');
	await expect.poll(rows, poll).toEqual(notes(2));
	await press('toggle');
	await expect.poll(() => document.querySelector('[data-list]'), poll).toBe(null);
	await press('more');
	await press('toggle');
	await expect.poll(rows, poll).toEqual(notes(3));
	await press('more');
	await expect.poll(rows, poll).toEqual(notes(4));
}

test('CSR: a list in an @if over plain state', async () => {
	await render(PlainIf);
	await followsItsData(true);
});
test('SSR: a list in an @if over plain state', async () => {
	await renderSSR(PlainIf);
	await followsItsData(true);
});
test('CSR: a list in a @switch arm', async () => {
	await render(SwitchArm);
	await followsItsData(false);
});
test('SSR: a list in a @switch arm', async () => {
	await renderSSR(SwitchArm);
	await followsItsData(false);
});
test('CSR: a list of component rows in an @if', async () => {
	await render(ComponentRows);
	await followsItsData(true);
});
test('SSR: a list of component rows in an @if', async () => {
	await renderSSR(ComponentRows);
	await followsItsData(true);
});
test('CSR: a list in an @if inside another @if', async () => {
	await render(NestedArms);
	await followsItsData(true);
});
test('SSR: a list in an @if inside another @if', async () => {
	await renderSSR(NestedArms);
	await followsItsData(true);
});
test('CSR: a list in an @if inside a @for row', async () => {
	await render(RowArms);
	await followsItsData(true);
});
test('SSR: a list in an @if inside a @for row', async () => {
	await renderSSR(RowArms);
	await followsItsData(true);
});
test('CSR: a list in an @if two components deep', async () => {
	await render(DeepPage);
	await followsItsData(true);
});
test('SSR: a list in an @if two components deep', async () => {
	await renderSSR(DeepPage);
	await followsItsData(true);
});

// A child's @if inside the parent's @try arm, and an @if in each row of a list inside a @try.
const orderRows = () => Array.from(document.querySelectorAll('[data-order]'), (row) => row.textContent?.trim());

async function childArmFollows() {
	await expect.poll(rows, poll).toEqual(notes(1));
	await press('more');
	await expect.poll(() => document.querySelector('[data-none]')?.textContent ?? null, poll).toBe('none');
	expect(rows()).toEqual([]);
	await press('more');
	await expect.poll(rows, poll).toEqual(notes(3));
	expect(document.querySelector('[data-none]')).toBe(null);
}

async function rowArmsFollow() {
	await expect.poll(orderRows, poll).toEqual(['x open', 'y shut']);
	await press('more');
	await expect.poll(orderRows, poll).toEqual(['x shut', 'y open']);
	await press('more');
	await expect.poll(orderRows, poll).toEqual(['x open', 'y shut']);
}

test('CSR: a child @if in the parent @try arm closes on the first re-fetch and reopens with its list', async () => {
	await render(TryChildIf);
	await childArmFollows();
});
test('SSR: a child @if in the parent @try arm closes on the first re-fetch and reopens with its list', async () => {
	await renderSSR(TryChildIf);
	await childArmFollows();
});
test('CSR: an @if in each row of a list in a @try follows re-fetches', async () => {
	await render(TryRowIf);
	await rowArmsFollow();
});
test('SSR: an @if in each row of a list in a @try follows re-fetches', async () => {
	await renderSSR(TryRowIf);
	await rowArmsFollow();
});

const title = () => document.querySelector('[data-title]')?.textContent ?? null;

// Each list is wired once: a second wiring adds every new row twice. The @if in the @try flips through a
// render of the arm, which wires the lists its own records name, and the @try commits again around it.
async function listKeepsOneWiring() {
	await expect.poll(title, poll).toBe('round 0');
	await press('more');
	await expect.poll(rows, poll).toEqual(notes(1));
	await press('refetch');
	await expect.poll(title, poll).toBe('round 1');
	await press('more');
	await expect.poll(rows, poll).toEqual(notes(2));
	await press('toggle');
	await expect.poll(() => document.querySelector('[data-list]'), poll).toBe(null);
	await press('more');
	await press('toggle');
	await expect.poll(rows, poll).toEqual(notes(3));
	await press('refetch');
	await expect.poll(title, poll).toBe('round 2');
	await press('more');
	await expect.poll(rows, poll).toEqual(notes(4));
}

test('CSR: a list in an @if in a @try is wired once across re-fetches and a reopen', async () => {
	await render(TryPlainIf);
	await listKeepsOneWiring();
});
test('SSR: a list in an @if in a @try is wired once across re-fetches and a reopen', async () => {
	await renderSSR(TryPlainIf);
	await listKeepsOneWiring();
});
test('CSR: the same list in an imported component is wired once', async () => {
	await render(EscalatedPage);
	await listKeepsOneWiring();
});
test('SSR: the same list in an imported component is wired once', async () => {
	await renderSSR(EscalatedPage);
	await listKeepsOneWiring();
});

// Known gap: the list's record exists only once its component has rendered, so an arm shut at load has none to wire.
test.fails('CSR: a list inside a same-file component an @if draws, shut at load (known gap)', async () => {
	await render(ChildList);
	await followsItsData(true);
});
test.fails('SSR: a list inside a same-file component an @if draws, shut at load (known gap)', async () => {
	await renderSSR(ChildList);
	await followsItsData(true);
});
