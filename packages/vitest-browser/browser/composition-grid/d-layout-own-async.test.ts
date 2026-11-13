import { beforeEach, test } from 'vitest';
import { render, renderSSR, renderStream } from '../../src/index.ts';
import LayoutOwnPage from './d-layout-own-page.tsrx';
import ShellOwnPage from './d-shell-own-page.tsrx';
import FixedInLayoutPage from './d-fixed-page.tsrx';
import FixedAlonePage from './d-fixed-alone-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, playStream, type Shape } from './timeline.ts';

// An other-file child with its own async value, keyed on the page's props, written inside a layout's children.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label}`);
const cardView = (board: Board) => [title(board), ...rows(board)];
const ledgerView = (board: Board) => [...rows(board), title(board)];
const shape = (view: (board: Board) => string[]): Shape => ({
	noArm: true,
	view,
	closed: () => [],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), failed],
});
const run = (view: (board: Board) => string[], mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) =>
	({ shape: shape(view), openAtLoad: true, mode, mount }) as const;

test('CSR', () => fullTimeline(run(cardView, 'CSR', () => render(LayoutOwnPage))));
test('SSR', () => fullTimeline(run(cardView, 'SSR', () => renderSSR(LayoutOwnPage))));
test('renamed: CSR', () => fullTimeline(run(ledgerView, 'CSR', () => render(ShellOwnPage))));
test('renamed: SSR', () => fullTimeline(run(ledgerView, 'SSR', () => renderSSR(ShellOwnPage))));

// The ported app's form: the child takes no props and sits under an element in the layout's children.
const fixedShape: Shape = { ...shape((board) => [title(board)]), fixed: true, pending: ['pending: Loading in child'] };
const fixed = (mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) => ({ shape: fixedShape, openAtLoad: true, mode, mount }) as const;
test('no props: CSR', () => fullTimeline(fixed('CSR', () => render(FixedInLayoutPage))));
test('no props: SSR', () => fullTimeline(fixed('SSR', () => renderSSR(FixedInLayoutPage))));
test('no layout: SSR streamed', () => fullTimeline(fixed('SSR', () => playStream(renderStream(FixedAlonePage)))));

test('SSR streamed', () => fullTimeline(run(cardView, 'SSR', () => playStream(renderStream(LayoutOwnPage)))));
test('renamed: SSR streamed', () => fullTimeline(run(ledgerView, 'SSR', () => playStream(renderStream(ShellOwnPage)))));
test('no props: SSR streamed', () => fullTimeline(fixed('SSR', () => playStream(renderStream(FixedInLayoutPage)))));
