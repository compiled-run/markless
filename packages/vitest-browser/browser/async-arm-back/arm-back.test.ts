import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import DeepNested from './deep-nested.tsrx';
import EditorNested from './editor-nested.tsrx';
import EditorRoot from './editor-root.tsrx';
import EditorRootNoArg from './editor-root-noarg.tsrx';
import ServedNested from './served-nested.tsrx';
import KeyedBoards from './keyed-boards.tsrx';
import KeyedTwins from './keyed-twins.tsrx';
import TripleBoards from './triple-boards.tsrx';
import TwinBoards from './twin-boards.tsrx';
import TwinImported from './twin-imported.tsrx';
import TwinServed from './twin-served.tsrx';

// A same-module child invokes a callback prop its parent passed; the write must reach the parent's own state.
afterEach(cleanup);
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

async function backCloses() {
	click('[data-open]');
	await expect.poll(() => document.querySelector('[data-back]')).not.toBeNull();
	click('[data-back]');
	await expect.poll(() => document.querySelector('[data-editor]')).toBeNull();
}

async function servedBack() {
	await expect.poll(() => document.querySelector('[data-back]')).not.toBeNull();
	click('[data-back]');
	await expect.poll(() => document.querySelector('[data-state]')?.textContent).toBe('closed');
}

async function leftBoardCloses() {
	const board = () => document.querySelector('[data-board="left"]')!;
	(board().querySelector('[data-open]') as HTMLElement).click();
	await expect.poll(() => board().querySelector('[data-back]')).not.toBeNull();
	(board().querySelector('[data-back]') as HTMLElement).click();
	await expect.poll(() => board().querySelector('[data-editor]')).toBeNull();
}

async function deepPick() {
	await expect.poll(() => document.querySelector('[data-pick]')).not.toBeNull();
	click('[data-pick]');
	await expect.poll(() => document.querySelector('[data-chosen]')?.textContent).toBe('picked');
}

test('client render: Back inside an @if arm closes the form when the page owns the state', async () => {
	await render(EditorRoot);
	await backCloses();
});

test('client render: a callback with no argument closes the form', async () => {
	await render(EditorRootNoArg);
	await backCloses();
});

test('client render: Back closes the form when its owner is one component below the page', async () => {
	await render(EditorNested);
	await backCloses();
});

test("client render: Back writes its owner's state with no @if, one component below the page", async () => {
	await render(ServedNested);
	await servedBack();
});

test("client render: a callback three same-module components below the page writes its owner's state", async () => {
	await render(DeepNested);
	await deepPick();
});

test('server render: Back inside an @if arm closes the form when the page owns the state', async () => {
	await renderSSR(EditorRoot);
	await backCloses();
});

test('server render: a callback with no argument closes the form', async () => {
	await renderSSR(EditorRootNoArg);
	await backCloses();
});

test('server render: Back closes the form when its owner is one component below the page', async () => {
	await renderSSR(EditorNested);
	await backCloses();
});

test("server render: Back writes its owner's state with no @if, one component below the page", async () => {
	await renderSSR(ServedNested);
	await servedBack();
});

test("server render: a callback three same-module components below the page writes its owner's state", async () => {
	await renderSSR(DeepNested);
	await deepPick();
});

test('client render: Back closes the first of two forms the page places from one component', async () => {
	await render(TwinBoards);
	await leftBoardCloses();
});

test('server render: Back closes the first of two forms the page places from one component', async () => {
	await renderSSR(TwinBoards);
	await leftBoardCloses();
});

const board = (name: string) => document.querySelector(`[data-board="${name}"]`)!;
const inBoard = (name: string, selector: string) => board(name).querySelector(selector);

// Every copy opens, then one copy's Back must close that copy and leave the others open.
async function onlyThatBoardCloses(names: ReadonlyArray<string>, closing: string) {
	for (const name of names) (inBoard(name, '[data-open]') as HTMLElement).click();
	for (const name of names) await expect.poll(() => inBoard(name, '[data-back]')).not.toBeNull();
	(inBoard(closing, '[data-back]') as HTMLElement).click();
	await expect.poll(() => inBoard(closing, '[data-editor]')).toBeNull();
	for (const name of names)
		if (name !== closing) expect(inBoard(name, '[data-back]'), name).not.toBeNull();
}

async function onlyThatServedBoardCloses(names: ReadonlyArray<string>, closing: string) {
	for (const name of names) await expect.poll(() => inBoard(name, '[data-back]')).not.toBeNull();
	(inBoard(closing, '[data-back]') as HTMLElement).click();
	await expect.poll(() => inBoard(closing, '[data-state]')?.textContent).toBe('closed');
	for (const name of names)
		if (name !== closing) expect(inBoard(name, '[data-state]')?.textContent, name).toBe('open');
}

for (const server of [false, true]) {
	const label = server ? 'server render' : 'client render';

	for (const closing of ['left', 'right'])
		test(`${label}: Back closes only the ${closing} of two forms the page places from one component`, async () => {
			if (server) await renderSSR(TwinBoards);
			else await render(TwinBoards);
			await onlyThatBoardCloses(['left', 'right'], closing);
		});

	for (const closing of ['near', 'far'])
		test(`${label}: with no @if, the ${closing} copy's callback writes only that copy's state`, async () => {
			if (server) await renderSSR(TwinServed);
			else await render(TwinServed);
			await onlyThatServedBoardCloses(['near', 'far'], closing);
		});

	for (const closing of ['one', 'two', 'three'])
		test(`${label}: Cancel closes only copy ${closing} of three`, async () => {
			if (server) await renderSSR(TripleBoards);
			else await render(TripleBoards);
			await onlyThatBoardCloses(['one', 'two', 'three'], closing);
		});

	for (const closing of ['red', 'green', 'blue'])
		test(`${label}: in a keyed @for, Close closes only the ${closing} row's card`, async () => {
			if (server) await renderSSR(KeyedBoards);
			else await render(KeyedBoards);
			await onlyThatBoardCloses(['red', 'green', 'blue'], closing);
		});

	for (const closing of ['a-top', 'a-bottom', 'b-bottom'])
		test(`${label}: two copies in each keyed @for row, Hide closes only ${closing}`, async () => {
			if (server) await renderSSR(KeyedTwins);
			else await render(KeyedTwins);
			await onlyThatBoardCloses(['a-top', 'a-bottom', 'b-top', 'b-bottom'], closing);
		});

	for (const closing of ['west', 'east'])
		test(`${label}: an imported child's Back closes only the ${closing} of two same-module owners`, async () => {
			if (server) await renderSSR(TwinImported);
			else await render(TwinImported);
			await onlyThatBoardCloses(['west', 'east'], closing);
		});
}
