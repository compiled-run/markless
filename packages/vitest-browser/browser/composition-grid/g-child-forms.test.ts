import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import EditorPage from './g-editor-page.tsrx';
import FormsPage from './g-forms-page.tsrx';
import StatusFormsPage from './g-status-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, type Shape } from './timeline.ts';

// Forms in an other-file child inside a page @try: one submit saves, one submit is refused by the server.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label}`);
const shape = (view: (board: Board) => string[]): Shape => ({
	noArm: true,
	view,
	closed: () => [],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), failed],
});
const formsView = (board: Board) => [title(board), ...rows(board)];
const run = (view: (board: Board) => string[], mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) =>
	({ shape: shape(view), openAtLoad: true, mode, mount }) as const;

test('CSR', () => fullTimeline(run(formsView, 'CSR', () => render(FormsPage))));
test('SSR', () => fullTimeline(run(formsView, 'SSR', () => renderSSR(FormsPage))));
test('renamed: CSR', () => fullTimeline(run(formsView, 'CSR', () => render(EditorPage))));
test('renamed: SSR', () => fullTimeline(run(formsView, 'SSR', () => renderSSR(EditorPage))));

// The ported app's form: the child takes no props and writes its own state before the save.
const status = (mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) =>
	({ shape: { ...shape((board: Board) => [title(board)]), fixed: true }, openAtLoad: true, mode, mount }) as const;
test('no props: CSR', () => fullTimeline(status('CSR', () => render(StatusFormsPage))));
test('no props: SSR', () => fullTimeline(status('SSR', () => renderSSR(StatusFormsPage))));
