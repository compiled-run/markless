import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import DeepNested from './deep-nested.tsrx';
import EditorNested from './editor-nested.tsrx';
import EditorRoot from './editor-root.tsrx';
import EditorRootNoArg from './editor-root-noarg.tsrx';
import ServedNested from './served-nested.tsrx';
import TwinBoards from './twin-boards.tsrx';

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

test("client render: Back inside an @if arm closes the form when the page owns the state", async () => {
	await render(EditorRoot);
	await backCloses();
});

test("client render: a callback with no argument closes the form", async () => {
	await render(EditorRootNoArg);
	await backCloses();
});

test("client render: Back closes the form when its owner is one component below the page", async () => {
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

test("server render: Back inside an @if arm closes the form when the page owns the state", async () => {
	await renderSSR(EditorRoot);
	await backCloses();
});

test("server render: a callback with no argument closes the form", async () => {
	await renderSSR(EditorRootNoArg);
	await backCloses();
});

test("server render: Back closes the form when its owner is one component below the page", async () => {
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

test("client render: Back closes the first of two forms the page places from one component", async () => {
	await render(TwinBoards);
	await leftBoardCloses();
});

test("server render: Back closes the first of two forms the page places from one component", async () => {
	await renderSSR(TwinBoards);
	await leftBoardCloses();
});
