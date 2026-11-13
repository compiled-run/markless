import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import LookupPage from './h-lookup-page.tsrx';
import OwnArmPage from './h-own-arm-page.tsrx';
import ServedOpenPage from './h-served-open-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, oneStep, someSteps, type Shape } from './timeline.ts';

// A child with its own async value keyed on the page's props, in a click-opened @if arm: same file closed at load,
// other file open at load, and the same-file page served open by a caller's constant prop.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label}`);
const shape = (view: (board: Board) => string[], closedLine: string): Shape => ({
	ownsLoad: true,
	view,
	closed: () => [closedLine],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), failed],
});
const panel = shape((board) => [title(board), ...rows(board)], 'closed: Closed');
const lookup = shape((board) => [...rows(board), title(board)], 'closed: Hidden');

test('closed at load: CSR', () => fullTimeline({ shape: panel, openAtLoad: false, mode: 'CSR', mount: () => render(OwnArmPage) }));
test('closed at load: SSR', () => fullTimeline({ shape: panel, openAtLoad: false, mode: 'SSR', mount: () => renderSSR(OwnArmPage) }));
const lookupOpen = (mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) => ({ shape: lookup, openAtLoad: true, mode, mount }) as const;
const servedOpen = (mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) => ({ shape: panel, openAtLoad: true, mode, mount }) as const;
// Every step that does not reopen the arm after a close: the reopening steps are pinned below.
const BEFORE_CLOSE = ['first render', 'reload while open', 'switch subject while open', 'save held', 'handler rejects', 'close'] as const;

test('other file, open at load: CSR', () => someSteps(lookupOpen('CSR', () => render(LookupPage)), BEFORE_CLOSE));
test('other file, open at load: SSR', () => someSteps(lookupOpen('SSR', () => renderSSR(LookupPage)), BEFORE_CLOSE));
test('served open by a caller: CSR', () => someSteps(servedOpen('CSR', () => render(ServedOpenPage)), BEFORE_CLOSE));
test('served open by a caller: SSR', () => someSteps(servedOpen('SSR', () => renderSSR(ServedOpenPage)), BEFORE_CLOSE));

// Known defect: a child composed while its arm was open in the first render keeps following its props after the arm
// closes, so it loads while closed and is reused, without asking again, when the arm reopens.
for (const [name, run] of [
	['other file, open at load: CSR', lookupOpen('CSR', () => render(LookupPage))],
	['other file, open at load: SSR', lookupOpen('SSR', () => renderSSR(LookupPage))],
	['served open by a caller: CSR', servedOpen('CSR', () => render(ServedOpenPage))],
	['served open by a caller: SSR', servedOpen('SSR', () => renderSSR(ServedOpenPage))],
] as const) {
	test.fails(`${name}: a closed arm loads nothing on a reload`, () => oneStep(run, 'reload while closed, then open'));
	test.fails(`${name}: an arm closed while loading asks again when it reopens`, () => oneStep(run, 'close while loading'));
}
