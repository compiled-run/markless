import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import OpenPage from './k-child-try-if-open-page.tsrx';
import ClosedPage from './k-child-try-if-closed-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, type Shape } from './timeline.ts';

// An @if inside a child component's own @try, flipped by the child's state while the value it shows keeps reloading.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label}`);
const view = (board: Board) => [title(board), `count: ${board.items.length} rows`, ...rows(board)];
const shape: Shape = {
	liveWhileClosed: true,
	view,
	closed: (board) => (board ? [title(board), 'closed: Summary', ...rows(board)] : ['pending: Loading']),
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), failed],
};

test('open at load: CSR', () => fullTimeline({ shape, openAtLoad: true, mode: 'CSR', mount: () => render(OpenPage) }));
test('open at load: SSR', () => fullTimeline({ shape, openAtLoad: true, mode: 'SSR', mount: () => renderSSR(OpenPage) }));
test('closed at load: CSR', () => fullTimeline({ shape, openAtLoad: false, mode: 'CSR', mount: () => render(ClosedPage) }));
test('closed at load: SSR', () => fullTimeline({ shape, openAtLoad: false, mode: 'SSR', mount: () => renderSSR(ClosedPage) }));
