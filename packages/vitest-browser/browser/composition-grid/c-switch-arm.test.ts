import { beforeEach, expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import KindPage from './c-kind-page.tsrx';
import SwitchPage from './c-switch-page.tsrx';
import { installServer, resetServer, server, type Board } from './grid-server.ts';
import { fullTimeline, oneStep, type Shape } from './timeline.ts';

// An other-file child in a @switch arm inside a page @try, reading the async value that decides the arm.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const card = (board: Board) => `card: ${board.parity} card for ${board.title}`;
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const switchView = (board: Board) => (board.parity === 'even' ? [title(board), card(board)] : [card(board), title(board)]);
const kindView = (board: Board) => [card(board), title(board)];

const shape = (view: (board: Board) => string[], checkArms = false): Shape => ({
	noArm: true,
	view,
	closed: () => [],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), failed],
	invariant: checkArms
		? () => expect(server.derives.filter((entry) => entry.split(':')[0] !== entry.split(':')[1]), 'derives with the other arm\'s value').toEqual([])
		: undefined,
});

const run = (view: (board: Board) => string[], mode: 'CSR' | 'SSR', mount: () => Promise<unknown>, checkArms = false) =>
	({ shape: shape(view, checkArms), openAtLoad: true, mode, mount }) as const;

test('CSR', () => fullTimeline(run(switchView, 'CSR', () => render(SwitchPage))));
test('SSR', () => fullTimeline(run(switchView, 'SSR', () => renderSSR(SwitchPage))));
test('renamed: CSR', () => fullTimeline(run(kindView, 'CSR', () => render(KindPage))));
test('renamed: SSR', () => fullTimeline(run(kindView, 'SSR', () => renderSSR(KindPage))));

// Known defect: when a reload moves the @switch to another arm, the leaving arm's child derives once more with the
// value that chose the new arm. An @if open in the first render does the same: such a child reads the page's value
// directly, not through the gated feed an arm opened later gets.
test.fails('CSR: no child derives with the other arm\'s value', () =>
	oneStep(run(switchView, 'CSR', () => render(SwitchPage), true), 'reload while open'));
test.fails('SSR: no child derives with the other arm\'s value', () =>
	oneStep(run(switchView, 'SSR', () => renderSSR(SwitchPage), true), 'reload while open'));
test.fails('renamed: CSR: no child derives with the other arm\'s value', () =>
	oneStep(run(kindView, 'CSR', () => render(KindPage), true), 'reload while open'));
test.fails('renamed: SSR: no child derives with the other arm\'s value', () =>
	oneStep(run(kindView, 'SSR', () => renderSSR(KindPage), true), 'reload while open'));
