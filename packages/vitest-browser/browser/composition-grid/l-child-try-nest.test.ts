import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import OpenPage from './l-child-try-nest-open-page.tsrx';
import ClosedPage from './l-child-try-nest-closed-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, type Shape } from './timeline.ts';

// A child's @try holds a child with its own @try and @if, ahead of an @if with the same local id.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label}`);
const view = (board: Board) => [title(board), ...rows(board), `count: ${board.items.length} rows`];
const shape: Shape = {
	liveWhileClosed: true,
	view,
	closed: (board) =>
		board ? [title(board), ...rows(board), 'closed: Summary'] : ['pending: Loading'],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), failed],
};

test('open at load: CSR', () =>
	fullTimeline({ shape, openAtLoad: true, mode: 'CSR', mount: () => render(OpenPage) }));
test('open at load: SSR', () =>
	fullTimeline({ shape, openAtLoad: true, mode: 'SSR', mount: () => renderSSR(OpenPage) }));
test('closed at load: CSR', () =>
	fullTimeline({ shape, openAtLoad: false, mode: 'CSR', mount: () => render(ClosedPage) }));
test('closed at load: SSR', () =>
	fullTimeline({ shape, openAtLoad: false, mode: 'SSR', mount: () => renderSSR(ClosedPage) }));
