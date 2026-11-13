import { beforeEach, expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import EntryNotePage from './i-entry-note-page.tsrx';
import RowDetailPage from './i-row-detail-page.tsrx';
import { installServer, resetServer, server, type Board } from './grid-server.ts';
import { fullTimeline, type Shape } from './timeline.ts';

// An other-file row component with its own async value keyed on its row, over rows from the page's answer, in a @try.
installServer();
beforeEach(resetServer);

const failed = 'failed: The save was refused';
const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label}: detail of ${row.id}`);
let checked = 0;
beforeEach(() => (checked = 0));
const shape = (view: (board: Board) => string[]): Shape => ({
	noArm: true,
	view,
	closed: () => [],
	pending: ['pending: Loading'],
	failed: (board) => [...view(board), failed],
	// Each step asks for a row's detail at most once, and only for a row the page shows.
	invariant: () => {
		const asked = server.details.slice(checked);
		checked = server.details.length;
		const shown = new Set([...document.querySelectorAll('[data-g="row"]')].map((row) => row.textContent?.split(':')[0]?.trim()));
		expect(asked.length, `details asked twice in one step: ${asked.join(', ')}`).toBe(new Set(asked).size);
		expect(asked.filter((id) => !shown.has(id.replace('-', ' '))), 'details asked for rows not shown').toEqual([]);
	},
});
const run = (view: (board: Board) => string[], mode: 'CSR' | 'SSR', mount: () => Promise<unknown>) =>
	({ shape: shape(view), openAtLoad: true, mode, mount }) as const;

test('CSR', () => fullTimeline(run((board) => [title(board), ...rows(board)], 'CSR', () => render(RowDetailPage))));
test('SSR', () => fullTimeline(run((board) => [title(board), ...rows(board)], 'SSR', () => renderSSR(RowDetailPage))));
test('renamed: CSR', () => fullTimeline(run((board) => [...rows(board), title(board)], 'CSR', () => render(EntryNotePage))));
test('renamed: SSR', () => fullTimeline(run((board) => [...rows(board), title(board)], 'SSR', () => renderSSR(EntryNotePage))));
