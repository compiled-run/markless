import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import SameFileOwnerPage from './l-same-file-owner-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, type Shape } from './timeline.ts';

// A click-opened arm drawn by an owner that a later component of its file places, holding a child with its own async value.
installServer();
beforeEach(resetServer);

const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label}`);
const view = (board: Board) => [...rows(board), title(board)];
const shape: Shape = {
	ownsLoad: true,
	view,
	closed: () => ['closed: Hidden'],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), 'failed: The save was refused'],
};

test('closed at load: CSR', () => fullTimeline({ shape, openAtLoad: false, mode: 'CSR', mount: () => render(SameFileOwnerPage) }));
test('closed at load: SSR', () => fullTimeline({ shape, openAtLoad: false, mode: 'SSR', mount: () => renderSSR(SameFileOwnerPage) }));
