import { beforeEach, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import BadgePage from './b-badge-page.tsrx';
import HeaderPage from './b-header-page.tsrx';
import { installServer, resetServer, type Board } from './grid-server.ts';
import { fullTimeline, oneStep, type Shape } from './timeline.ts';

// An other-file child in a page @try reading the async prop in an attribute and in an @if test.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const headerView = (board: Board) => [
	`title.${board.parity}: ${board.title}`,
	board.items.length > 1 ? `many: ${board.items.length} rows` : 'one: One row',
];
const badgeView = (board: Board) => [
	board.parity === 'even' ? 'even: Even' : 'odd: Odd',
	`title.${board.parity}: ${board.title}`,
];
const shape = (view: (board: Board) => string[]): Shape => ({
	noArm: true,
	view,
	closed: () => [],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), failed],
});

const header = (mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) =>
	({ shape: shape(headerView), openAtLoad: true, mode, mount }) as const;
const badge = (mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) =>
	({ shape: shape(badgeView), openAtLoad: true, mode, mount }) as const;

// The header's @if flips only when the subject changes the row count; the badge's flips on every reload.
test('CSR', () => fullTimeline(header('CSR', () => render(HeaderPage)), ['switch subject while open']));
test('SSR', () => fullTimeline(header('SSR', () => renderSSR(HeaderPage)), ['switch subject while open']));
test('renamed: CSR', () => fullTimeline(badge('CSR', () => render(BadgePage)), ['reload while open']));
test('renamed: SSR', () => fullTimeline(badge('SSR', () => renderSSR(BadgePage)), ['reload while open']));

// Known defect: an @if test computed over a member of the prop is not re-run when the prop reloads, so the arm stays.
test.fails('CSR: the @if follows a subject switch', () => oneStep(header('CSR', () => render(HeaderPage)), 'switch subject while open'));
test.fails('SSR: the @if follows a subject switch', () => oneStep(header('SSR', () => renderSSR(HeaderPage)), 'switch subject while open'));
test.fails('renamed: CSR: the @if follows a reload', () => oneStep(badge('CSR', () => render(BadgePage)), 'reload while open'));
test.fails('renamed: SSR: the @if follows a reload', () => oneStep(badge('SSR', () => renderSSR(BadgePage)), 'reload while open'));
