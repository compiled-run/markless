import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import AddedSiblingLists from './const-for-row-attr/added-sibling-lists.tsrx';
import Imported from './const-for-row-attr/imported.tsrx';
import RowIndexedList from './const-for-row-attr/row-indexed-list.tsrx';
import SiblingLists from './const-for-row-attr/sibling-lists.tsrx';

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
