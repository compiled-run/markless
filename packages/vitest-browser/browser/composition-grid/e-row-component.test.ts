import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import RowsPage from './e-rows-page.tsrx';
import SortedPage from './e-sorted-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, oneStep, type Shape } from './timeline.ts';

// A row component from another file in a @for over the child's async prop, and over a sync computed of it.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rowsView = (board: Board) => [title(board), ...board.items.map((row) => `row: ${row.label}`)];
const sortedView = (board: Board) => [
	...[...board.items].reverse().map((row, at) => `row: ${at + 1}. ${row.label}`),
	title(board),
];
const shape = (view: (board: Board) => string[]): Shape => ({
	noArm: true,
	view,
	closed: () => [],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), failed],
});
const run = (view: (board: Board) => string[], mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) =>
	({ shape: shape(view), openAtLoad: true, mode, mount }) as const;

test('CSR', () => fullTimeline(run(rowsView, 'CSR', () => render(RowsPage))));
test('SSR', () => fullTimeline(run(rowsView, 'SSR', () => renderSSR(RowsPage))));
// The save adds a row in front, which the index pin below covers.
test('over a computed: CSR', () => fullTimeline(run(sortedView, 'CSR', () => render(SortedPage)), ['save held']));
test('over a computed: SSR', () => fullTimeline(run(sortedView, 'SSR', () => renderSSR(SortedPage)), ['save held']));

// Known defect: a row component given the loop index keeps the index it was built with when a row is added in front.
test.fails('over a computed: CSR: rows renumber after a save', () => oneStep(run(sortedView, 'CSR', () => render(SortedPage)), 'save held'));
test.fails('over a computed: SSR: rows renumber after a save', () => oneStep(run(sortedView, 'SSR', () => renderSSR(SortedPage)), 'save held'));
