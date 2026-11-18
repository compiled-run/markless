import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import OpenPage from './j-arm-list-open-page.tsrx';
import ClosedPage from './j-arm-list-closed-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, type Shape } from './timeline.ts';

// A @for written straight into an @if/@else arm of the page's own @try, over the async value; the title outside the arm keeps it loading while closed.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label.toUpperCase()}`);
const shape: Shape = {
	liveWhileClosed: true,
	view: (board) => [title(board), ...rows(board)],
	closed: (board) => (board ? [title(board), 'closed: Summary'] : ['pending: Loading']),
	pending: ['pending: Loading'],
	failed: (board) => [title(board), ...rows(board), failed],
};

test('open at load: CSR', () => fullTimeline({ shape, openAtLoad: true, mode: 'CSR', mount: () => render(OpenPage) }));
test('open at load: SSR', () => fullTimeline({ shape, openAtLoad: true, mode: 'SSR', mount: () => renderSSR(OpenPage) }));
test('closed at load: CSR', () => fullTimeline({ shape, openAtLoad: false, mode: 'CSR', mount: () => render(ClosedPage) }));
test('closed at load: SSR', () => fullTimeline({ shape, openAtLoad: false, mode: 'SSR', mount: () => renderSSR(ClosedPage) }));
