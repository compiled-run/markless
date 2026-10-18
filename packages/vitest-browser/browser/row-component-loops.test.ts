import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Library from './row-component-loops/shelf.tsrx';
import Outline from './row-component-loops/tree.tsrx';
import Station from './row-component-loops/station.tsrx';

afterEach(() => cleanup());

const click = (container: Element, selector: string): void => {
	(container.querySelector(selector) as HTMLElement).click();
};
const books = (container: Element, shelf: string): string[] =>
	Array.from(container.querySelectorAll(`[data-shelf="${shelf}"] [data-book]`)).map(
		(book) => book.textContent ?? '',
	);
// Each node with the ids of its direct children, so a node nested under the wrong parent shows.
const tree = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-node]')).map((node) => {
		const kids = Array.from(node.querySelector(':scope > .kids')!.children).map(
			(kid) => kid.getAttribute('data-node') ?? kid.tagName.toLowerCase(),
		);
		return `${node.getAttribute('data-node')}:${kids.join(',')}`;
	});
const hits = (container: Element, id: string): string =>
	container.querySelector(`[data-node="${id}"] > button.hit`)?.textContent ?? '';
const tracks = (container: Element, slug: string): string[] =>
	Array.from(container.querySelectorAll(`[data-row="${slug}"] li.track`)).map(
		(track) => track.textContent ?? '',
	);
const plays = (container: Element, slug: string): string =>
	container.querySelector(`[data-row="${slug}"] output.plays`)?.textContent ?? '';
const heading = (container: Element, slug: string): string =>
	(container.querySelector(`[data-row="${slug}"] .title`)?.tagName ?? '').toLowerCase();

// An imported row component wrapped in its own row element, with its own state, a
// render-chosen heading tag and a handler on every nested row.
async function playlistGrowsAndStaysInteractive(container: Element): Promise<void> {
	expect(tracks(container, 'jazz')).toEqual(['One']);
	click(container, '[data-row="jazz"] li.track[data-no="1"] em');
	await expect.poll(() => container.querySelector('[data-last]')?.textContent).toBe('1');
	await expect.poll(() => plays(container, 'jazz'), 'plays jazz 1').toBe('1');
	click(container, '[data-add-rock]');
	await expect.poll(() => tracks(container, 'rock')).toEqual(['Seven', 'Eight']);
	expect(heading(container, 'rock')).toBe('h4');
	expect(heading(container, 'jazz')).toBe('h3');

	click(container, '[data-row="rock"] li.track[data-no="8"] em');
	await expect.poll(() => container.querySelector('[data-last]')?.textContent).toBe('8');
	await expect.poll(() => plays(container, 'rock'), 'plays rock 1').toBe('1');
	expect(plays(container, 'jazz')).toBe('1');

	click(container, '[data-append]');
	await expect.poll(() => tracks(container, 'rock')).toEqual(['Seven', 'Eight', 'Nine']);
	click(container, '[data-row="rock"] li.track[data-no="9"] em');
	await expect.poll(() => container.querySelector('[data-last]')?.textContent).toBe('9');
	await expect.poll(() => plays(container, 'rock'), 'plays rock 2').toBe('2');

	click(container, '[data-append-jazz]');
	await expect.poll(() => tracks(container, 'jazz')).toEqual(['One', 'Two']);
	click(container, '[data-row="jazz"] li.track[data-no="2"] em');
	await expect.poll(() => container.querySelector('[data-last]')?.textContent).toBe('2');
	await expect.poll(() => plays(container, 'jazz'), 'plays jazz 2').toBe('2');

	// Removed and built again under its key: one copy of each nested row, fresh state.
	click(container, '[data-drop-rock]');
	await expect.poll(() => tracks(container, 'rock')).toEqual([]);
	click(container, '[data-add-rock]');
	await expect.poll(() => tracks(container, 'rock')).toEqual(['Seven', 'Eight']);
	expect(container.querySelectorAll('[data-row="rock"]').length).toBe(1);
	click(container, '[data-row="rock"] li.track[data-no="7"] em');
	await expect.poll(() => container.querySelector('[data-last]')?.textContent).toBe('7');
	await expect.poll(() => plays(container, 'rock'), 'plays rock 1').toBe('1');
	expect(
		Array.from(container.querySelector('.lists')!.children).map(
			(row) => row.getAttribute('data-row') ?? row.className,
		),
	).toEqual(['static', 'jazz', 'rock']);
}

test('SSR resume: an imported, wrapped row component with a nested list grows and stays interactive', async () => {
	const { container } = await renderSSR(Station);
	await playlistGrowsAndStaysInteractive(container);
});

test('CSR: an imported, wrapped row component with a nested list grows and stays interactive', async () => {
	const { container } = await render(Station);
	await playlistGrowsAndStaysInteractive(container);
});

test(`SSR resume: a row component holding its own @for fills when the row is built in the browser`, async () => {
	const { container } = await renderSSR(Library);
	expect(books(container, 'fiction')).toEqual(['Dune']);

	click(container, '[data-add-shelf]');
	await expect.poll(() => books(container, 'poetry')).toEqual(['Odes', 'Sonnets']);

	click(container, '[data-add-book]');
	await expect.poll(() => books(container, 'poetry')).toEqual(['Odes', 'Sonnets', 'Elegies']);
	click(container, '[data-drop-book]');
	await expect.poll(() => books(container, 'poetry')).toEqual(['Sonnets', 'Elegies']);
	expect(books(container, 'fiction')).toEqual(['Dune']);
});

test(`SSR resume: a recursive tree grows under a node the browser built`, async () => {
	const { container } = await renderSSR(Outline);
	expect(tree(container)).toEqual(['a:a1', 'a1:']);

	click(container, '[data-add-root]');
	await expect.poll(() => tree(container)).toEqual(['a:a1', 'a1:', 'b:b1', 'b1:']);
	// Each node keeps its own state through a graft beneath it, served or built here.
	click(container, '[data-node="b"] > button.hit');
	click(container, '[data-node="b1"] > button.hit');
	click(container, '[data-node="b1"] > button.hit');
	click(container, '[data-node="a1"] > button.hit');
	await expect
		.poll(() => ['a', 'a1', 'b', 'b1'].map((id) => hits(container, id)))
		.toEqual(['0', '1', '1', '2']);

	click(container, '[data-graft-b1]');
	await expect.poll(() => tree(container)).toEqual(['a:a1', 'a1:', 'b:b1', 'b1:b1x', 'b1x:']);

	click(container, '[data-graft-a1]');
	await expect
		.poll(() => tree(container))
		.toEqual(['a:a1', 'a1:a1x', 'a1x:', 'b:b1', 'b1:b1x', 'b1x:']);
	expect(['a', 'a1', 'a1x', 'b', 'b1', 'b1x'].map((id) => hits(container, id))).toEqual([
		'0',
		'1',
		'0',
		'1',
		'2',
		'0',
	]);
	click(container, '[data-node="b1x"] > button.hit');
	await expect.poll(() => hits(container, 'b1x')).toBe('1');
	expect(hits(container, 'b1')).toBe('2');
});

test(`CSR: a row component holding its own @for fills when the row is built in the browser`, async () => {
	const { container } = await render(Library);
	expect(books(container, 'fiction')).toEqual(['Dune']);

	click(container, '[data-add-shelf]');
	await expect.poll(() => books(container, 'poetry')).toEqual(['Odes', 'Sonnets']);

	click(container, '[data-add-book]');
	await expect.poll(() => books(container, 'poetry')).toEqual(['Odes', 'Sonnets', 'Elegies']);
	click(container, '[data-drop-book]');
	await expect.poll(() => books(container, 'poetry')).toEqual(['Sonnets', 'Elegies']);
	expect(books(container, 'fiction')).toEqual(['Dune']);
});

test(`CSR: a recursive tree grows under a node the browser built`, async () => {
	const { container } = await render(Outline);
	expect(tree(container)).toEqual(['a:a1', 'a1:']);

	click(container, '[data-add-root]');
	await expect.poll(() => tree(container)).toEqual(['a:a1', 'a1:', 'b:b1', 'b1:']);
	// Each node keeps its own state through a graft beneath it, served or built here.
	click(container, '[data-node="b"] > button.hit');
	click(container, '[data-node="b1"] > button.hit');
	click(container, '[data-node="b1"] > button.hit');
	click(container, '[data-node="a1"] > button.hit');
	await expect
		.poll(() => ['a', 'a1', 'b', 'b1'].map((id) => hits(container, id)))
		.toEqual(['0', '1', '1', '2']);

	click(container, '[data-graft-b1]');
	await expect.poll(() => tree(container)).toEqual(['a:a1', 'a1:', 'b:b1', 'b1:b1x', 'b1x:']);

	click(container, '[data-graft-a1]');
	await expect
		.poll(() => tree(container))
		.toEqual(['a:a1', 'a1:a1x', 'a1x:', 'b:b1', 'b1:b1x', 'b1x:']);
	expect(['a', 'a1', 'a1x', 'b', 'b1', 'b1x'].map((id) => hits(container, id))).toEqual([
		'0',
		'1',
		'0',
		'1',
		'2',
		'0',
	]);
	click(container, '[data-node="b1x"] > button.hit');
	await expect.poll(() => hits(container, 'b1x')).toBe('1');
	expect(hits(container, 'b1')).toBe('2');
});
