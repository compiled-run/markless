import { beforeEach, test } from 'vitest';
import { render, renderSSR, renderStream } from '../../src/index.ts';
import LayoutListPage from './a-layout-page.tsrx';
import ShellEntriesPage from './a-shell-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, playStream, type Shape } from './timeline.ts';

// An other-file child in a @try written in another component's children, reading the page's async value as a prop,
// with a sync computed over it in the child.
installServer();
beforeEach(resetServer);

const view = (board: Board) => [
		`title.${board.parity}: ${board.title}`,
		`count: ${board.items.length} rows`,
	...board.items.map((row) => `row: ${row.label}`),
];
const shape: Shape = {
	noArm: true,
	view,
	closed: () => [],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), 'failed: The save was refused'],
};

const run = { shape, openAtLoad: true } as const;

test('CSR', () => fullTimeline({ ...run, mode: 'CSR', mount: () => render(LayoutListPage) }));
test('SSR', () => fullTimeline({ ...run, mode: 'SSR', mount: () => renderSSR(LayoutListPage) }));
test('SSR streamed', () => fullTimeline({ ...run, mode: 'SSR', mount: () => playStream(renderStream(LayoutListPage)) }));
test('renamed: CSR', () => fullTimeline({ ...run, mode: 'CSR', mount: () => render(ShellEntriesPage) }));
test('renamed: SSR', () => fullTimeline({ ...run, mode: 'SSR', mount: () => renderSSR(ShellEntriesPage) }));
