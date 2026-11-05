import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import AddedSiblingLists from './const-for-row-attr/added-sibling-lists.tsrx';
import ArmServedList from './const-for-row-attr/arm-served-list.tsrx';
import Imported from './const-for-row-attr/imported.tsrx';
import RowIndexedList from './const-for-row-attr/row-indexed-list.tsrx';
import SiblingLists from './const-for-row-attr/sibling-lists.tsrx';
import SlotAfterList from './const-for-row-attr/slot-after-list.tsrx';
import SlotAfterServedList from './const-for-row-attr/slot-after-served-list.tsrx';

// Rows of an @for over module constant data repaint an attribute that reads page state, as the attribute outside the list does.

afterEach(cleanup);

const classes = () => [
	document.querySelector('[data-step]')!.getAttribute('class'),
	...[...document.querySelectorAll('[data-row]')].map((row) => row.getAttribute('class')),
];
const step = () => document.querySelector<HTMLElement>('[data-step]')!.click();
const children = () =>
	[...document.querySelectorAll('[data-row]')].map(
		(row) =>
			`${row.getAttribute('data-row')}:${[...row.children].map((kid) => kid.textContent || kid.tagName).join(',')}`,
	);

async function rowsFollowState() {
	const served = children();
	expect(classes()).toEqual(['off', 'off', 'off', 'off']);
	step();
	await expect.poll(classes).toEqual(['on', 'on', 'on', 'on']);
	step();
	await expect.poll(classes).toEqual(['off', 'off', 'off', 'off']);
	expect(children()).toEqual(served);
}

test('CSR: rows of an imported constant list repaint a class that reads page state', async () => {
	await render(Imported);
	await rowsFollowState();
});
test('SSR resume: rows of an imported constant list repaint a class that reads page state', async () => {
	await renderSSR(Imported);
	await rowsFollowState();
});

test('CSR: constant rows holding two sibling lists repaint a class that reads page state', async () => {
	await render(SiblingLists);
	expect(children()).toEqual(['lyra:path,path,a', 'maia:path,b,c', 'nova:path,d']);
	await rowsFollowState();
});
test('SSR resume: constant rows holding two sibling lists repaint a class that reads page state', async () => {
	await renderSSR(SiblingLists);
	expect(children()).toEqual(['lyra:path,path,a', 'maia:path,b,c', 'nova:path,d']);
	await rowsFollowState();
});

test('CSR: constant rows holding a list the row indexes into constant data repaint a class that reads page state', async () => {
	await render(RowIndexedList);
	await rowsFollowState();
	expect(document.querySelectorAll('[data-row="lyra"] [data-mark]')).toHaveLength(2);
});
test('SSR resume: constant rows holding a list the row indexes into constant data repaint a class that reads page state', async () => {
	await renderSSR(RowIndexedList);
	await rowsFollowState();
	expect(document.querySelectorAll('[data-row="lyra"] [data-mark]')).toHaveLength(2);
});

async function addedRowBuildsBothLists() {
	step();
	await expect.poll(classes).toEqual(['on', 'on', 'on']);
	document.querySelector<HTMLElement>('[data-add]')!.click();
	await expect.poll(children).toEqual(['lyra:path,a', 'maia:path,b', 'nova:path,path,c,d']);
	expect(classes()).toEqual(['on', 'on', 'on', 'on']);
	step();
	await expect.poll(classes).toEqual(['off', 'off', 'off', 'off']);
}

test('CSR: a row added to a list builds both of its sibling lists and repaints with page state', async () => {
	await render(AddedSiblingLists);
	await addedRowBuildsBothLists();
});
test('SSR resume: a row added to a list builds both of its sibling lists and repaints with page state', async () => {
	await renderSSR(AddedSiblingLists);
	await addedRowBuildsBothLists();
});

const labelled = () => ({
	labels: [...document.querySelectorAll('[data-label]')].map((label) =>
		label.getAttribute('class'),
	),
	marks: [...document.querySelectorAll('[data-mark]')].map((mark) => mark.getAttribute('class')),
});

// The label follows the row's inner list, so its live position is counted from the end of the row.
async function labelAfterListRepaints() {
	const before = { labels: ['off', 'off', 'off'], marks: ['mark', 'mark', 'mark', 'mark'] };
	expect(labelled()).toEqual(before);
	step();
	await expect.poll(labelled).toEqual({ ...before, labels: ['on', 'on', 'on'] });
	step();
	await expect.poll(labelled).toEqual(before);
}

test('CSR: a row attribute after the row’s inner list repaints, and the list rows are left alone', async () => {
	await render(SlotAfterList);
	await labelAfterListRepaints();
});
test('SSR resume: a row attribute after the row’s inner list repaints, and the list rows are left alone', async () => {
	await renderSSR(SlotAfterList);
	await labelAfterListRepaints();
});
test('CSR: a row attribute after a list only the server renders repaints, and the list rows are left alone', async () => {
	await render(SlotAfterServedList);
	await labelAfterListRepaints();
});
test('SSR resume: a row attribute after a list only the server renders repaints, and the list rows are left alone', async () => {
	await renderSSR(SlotAfterServedList);
	await labelAfterListRepaints();
});

const armRows = () =>
	[...document.querySelectorAll('[data-row]')].map(
		(row) => `${row.getAttribute('class')}:${row.querySelectorAll('[data-mark]').length}`,
	);

async function reopenedArmKeepsServedRows() {
	expect(armRows()).toEqual(['off:2', 'off:1', 'off:1']);
	document.querySelector<HTMLElement>('[data-open]')!.click();
	await expect.poll(armRows).toEqual([]);
	document.querySelector<HTMLElement>('[data-open]')!.click();
	await expect.poll(armRows).toEqual(['off:2', 'off:1', 'off:1']);
	step();
	await expect.poll(armRows).toEqual(['on:2', 'on:1', 'on:1']);
}

test('CSR: rows holding a list only the server renders keep it when their @if arm closes and reopens', async () => {
	await render(ArmServedList);
	await reopenedArmKeepsServedRows();
});
test('SSR resume: rows holding a list only the server renders keep it when their @if arm closes and reopens', async () => {
	await renderSSR(ArmServedList);
	await reopenedArmKeepsServedRows();
});
