import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import SwitcherPage from './f-switcher-page.tsrx';
import TabsPage from './f-tabs-page.tsrx';
import OpenSwitcherPage from './f-open-switcher-page.tsrx';
import SwitcherShell from './f-switcher-nested-page.tsrx';
import TabsShell from './f-tabs-nested-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, type Shape } from './timeline.ts';

// An other-file child in a click-opened @if/@else arm of a @try child, with a sync computed over the async prop
// feeding its @for. The value is shown outside the arm too, so it loads and reloads while the arm is closed.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label.toUpperCase()}`);
const shape = (closedLine: string): Shape => ({
	liveWhileClosed: true,
	view: (board) => [title(board), ...rows(board)],
	closed: (board) => (board ? [title(board), closedLine] : ['pending: Loading']),
	pending: ['pending: Loading'],
	failed: (board) => [title(board), ...rows(board), failed],
});
const tabs = (mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) =>
	({ shape: shape('closed: Summary'), openAtLoad: true, mode, mount }) as const;
const switcher = (mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) =>
	({ shape: shape('closed: Hidden'), openAtLoad: false, mode, mount }) as const;

test('open at load: CSR', () => fullTimeline(tabs('CSR', () => render(TabsPage))));
test('open at load: SSR', () => fullTimeline(tabs('SSR', () => renderSSR(TabsPage))));
test('closed at load: CSR', () => fullTimeline(switcher('CSR', () => render(SwitcherPage))));
test('closed at load: SSR', () => fullTimeline(switcher('SSR', () => renderSSR(SwitcherPage))));
// One component deeper, as a router page places it: the arm's records cross two levels of composition.
test('open at load, one component deeper: SSR', () => fullTimeline(tabs('SSR', () => renderSSR(TabsShell))));
test('closed at load, one component deeper: SSR', () => fullTimeline(switcher('SSR', () => renderSSR(SwitcherShell))));

test('renamed, open at load: CSR', () =>
	fullTimeline({ ...switcher('CSR', () => render(OpenSwitcherPage)), openAtLoad: true }));
