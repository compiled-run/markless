import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import RowPairPage from './e-row-pair-page.tsrx';
import RowPartsPage from './e-row-parts-page.tsrx';
import RowsPage from './e-rows-page.tsrx';
import SortedPage from './e-sorted-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, type Shape } from './timeline.ts';

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
const partsView = (board: Board) => [title(board), ...board.items.map((row) => `row: ${row.label}edit`)];
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
test('over a computed: CSR', () => fullTimeline(run(sortedView, 'CSR', () => render(SortedPage))));
test('over a computed: SSR', () => fullTimeline(run(sortedView, 'SSR', () => renderSSR(SortedPage))));
// The row is one component from another file that renders two more.
test('row of parts: CSR', () => fullTimeline(run(partsView, 'CSR', () => render(RowPartsPage))));
test('row of parts: SSR', () => fullTimeline(run(partsView, 'SSR', () => renderSSR(RowPartsPage))));
// The row holds two components from another file side by side.
test('row of two components: CSR', () => fullTimeline(run(partsView, 'CSR', () => render(RowPairPage))));
test('row of two components: SSR', () => fullTimeline(run(partsView, 'SSR', () => renderSSR(RowPairPage))));
