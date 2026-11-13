import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { poll } from '../back-revalidate/support.ts';
import { click, frames, text, texts, watch } from '../hold-after-save/support.ts';
import AddsPage from './adds-page.tsrx';
import DetailPage from './detail-page.tsrx';
import EdgesPage from './edges-page.tsrx';
import RowCallbackPage from './row-callback-page.tsrx';
import RowStatePage from './row-state-page.tsrx';
import { installServer, resetServer, server } from './server.ts';
import SharedPage from './shared-page.tsrx';
import TogglePage from './toggle-page.tsrx';

// Several saves out at once: each "saving" look stays from its press until the reloaded data that confirms it is on screen.
installServer();
beforeEach(() => resetServer());
afterEach(async () => {
	resetServer();
	await cleanup();
});

type Mode = 'CSR' | 'SSR';
const MODES: Mode[] = ['CSR', 'SSR'];
const pages = {
	shared: { CSR: () => render(SharedPage), SSR: () => renderSSR(SharedPage) },
	rowState: { CSR: () => render(RowStatePage), SSR: () => renderSSR(RowStatePage) },
	rowCallback: { CSR: () => render(RowCallbackPage), SSR: () => renderSSR(RowCallbackPage) },
	toggle: { CSR: () => render(TogglePage), SSR: () => renderSSR(TogglePage) },
	adds: { CSR: () => render(AddsPage), SSR: () => renderSSR(AddsPage) },
	detail: { CSR: () => render(DetailPage), SSR: () => renderSSR(DetailPage) },
	edges: { CSR: () => render(EdgesPage), SSR: () => renderSSR(EdgesPage) },
};

async function ready(mode: Mode, page: keyof typeof pages, selector = '[data-flag], [data-todo]') {
	await pages[page][mode]();
	await expect.poll(() => document.querySelector(selector), poll).not.toBeNull();
	document.querySelector<HTMLElement>('button')!.focus();
	server.open = false;
}

// A flag row as painted: on or off, and `+p` while it shows its saving mark.
function look(id: string): string | null {
	const row = document.querySelector<HTMLElement>(`[data-flag="${id}"]`);
	if (!row) return null;
	return `${row.dataset.on}${row.dataset.pending === 'yes' ? '+p' : ''}`;
}
const looks = (...ids: string[]) => ids.map(look);

async function answerSave(what: string, ok = true) {
	await expect.poll(() => server.saves.some((save) => save.what === what), poll).toBe(true);
	const at = server.saves.findIndex((save) => save.what === what);
	server.saves.splice(at, 1)[0]!.answer(ok);
}
async function answerReads() {
	await expect.poll(() => server.reads.length, poll).toBeGreaterThan(0);
	for (const read of server.reads.splice(0)) read.answer();
}
async function press(selector: string, until: () => unknown, expected: unknown) {
	click(selector);
	await expect.poll(until, poll).toEqual(expected);
}
// The distinct answers `look` gave at every DOM change, in order.
const seen = <T>(changes: Array<{ value: T }>) => changes.map(({ value }) => value);
// One column of those answers, each change of it once.
const column = <T>(rows: T[][], at: number) =>
	rows.map((row) => row[at]).filter((value, index, all) => index === 0 || value !== all[index - 1]);

for (const mode of MODES) {
	for (const first of ['a', 'b'] as const) {
		const second = first === 'a' ? 'b' : 'a';
		for (const page of ['shared', 'rowState', 'rowCallback'] as const)
			test(`${mode} ${page}: two saves on different rows, ${first} answered first: neither saving look goes before the reload`, async () => {
				await ready(mode, page);
				const stop = watch(() => looks('a', 'b'));
				await press('[data-flip="a"]', () => looks('a', 'b'), ['on+p', 'off']);
				// The second press shows at once although the first save is still out.
				await press('[data-flip="b"]', () => looks('a', 'b'), ['on+p', 'on+p']);
				await answerSave(`flip ${first}`);
				await frames(5);
				expect(looks('a', 'b')).toEqual(['on+p', 'on+p']);
				await answerSave(`flip ${second}`);
				await expect.poll(() => server.reads.length, poll).toBeGreaterThan(0);
				await frames(5);
				expect(looks('a', 'b')).toEqual(['on+p', 'on+p']);
				await answerReads();
				await expect.poll(() => looks('a', 'b'), poll).toEqual(['on', 'on']);
				const { changes } = await stop();
				expect(seen(changes)).toEqual([
					['off', 'off'],
					['on+p', 'off'],
					['on+p', 'on+p'],
					['on', 'on'],
				]);
				expect(server.readsSent).toBe(1 + (mode === 'CSR' ? 1 : 0));
			});
	}

	test(`${mode}: two saves on the same row: the last press shows, and the first never comes back`, async () => {
		await ready(mode, 'toggle');
		const stop = watch(() => look('a'));
		await press('[data-toggle="a"]', () => look('a'), 'on');
		await press('[data-toggle="a"]', () => look('a'), 'off');
		await answerSave('set a on');
		await frames(5);
		expect(look('a')).toBe('off');
		await answerSave('set a off');
		await answerReads();
		await frames(5);
		expect(look('a')).toBe('off');
		expect(seen((await stop()).changes)).toEqual(['off', 'on', 'off']);
	});

	test(`${mode}: a toggle pressed three times quickly shows each press and lands on the last`, async () => {
		await ready(mode, 'toggle');
		const stop = watch(() => look('a'));
		await press('[data-toggle="a"]', () => look('a'), 'on');
		await press('[data-toggle="a"]', () => look('a'), 'off');
		await press('[data-toggle="a"]', () => look('a'), 'on');
		await answerSave('set a on');
		await answerSave('set a off');
		await frames(3);
		expect(look('a')).toBe('on');
		await answerSave('set a on');
		await answerReads();
		await frames(5);
		expect(look('a')).toBe('on');
		expect(seen((await stop()).changes)).toEqual(['off', 'on', 'off', 'on']);
	});

	test(`${mode}: three quick adds answered out of order: each saving row stays until its saved row shows`, async () => {
		await ready(mode, 'adds', '[data-todo]');
		const stop = watch(() => [texts('[data-todo]'), texts('[data-saving]')]);
		for (const count of [1, 2, 3]) await press('[data-add]', () => texts('[data-saving]').length, count);
		await answerSave('add Jam');
		await frames(3);
		await answerSave('add Tea');
		await frames(3);
		expect(texts('[data-saving]')).toEqual(['Bread', 'Jam', 'Tea']);
		await answerSave('add Bread');
		await answerReads();
		await expect.poll(() => texts('[data-todo]'), poll).toEqual(['Milk', 'Jam', 'Tea', 'Bread']);
		const { changes, painted } = await stop();
		// A title once pressed is a saved row or a saving row at every DOM change, and never both in a painted frame.
		const titles = ['Bread', 'Jam', 'Tea'];
		const pressed = (saved: string[], saving: string[]) => titles.filter((title) => saved.includes(title) || saving.includes(title));
		let most = 0;
		for (const [saved, saving] of seen(changes)) {
			expect(pressed(saved, saving).length).toBeGreaterThanOrEqual(most);
			most = Math.max(most, pressed(saved, saving).length);
		}
		for (const [saved, saving] of painted) expect(saving.filter((title) => saved.includes(title))).toEqual([]);
		expect(painted.at(-1)).toEqual([['Milk', 'Jam', 'Tea', 'Bread'], []]);
	});

	test(`${mode}: a save that fails while another is out releases its row at once`, async () => {
		await ready(mode, 'shared');
		await press('[data-flip="a"]', () => looks('a', 'b'), ['on+p', 'off']);
		await press('[data-flip="b"]', () => looks('a', 'b'), ['on+p', 'on+p']);
		await answerSave('flip a', false);
		await expect.poll(() => [looks('a', 'b'), text('[data-failed]')], poll).toEqual([['off', 'on+p'], 'a']);
		await answerSave('flip b');
		await frames(5);
		expect(looks('a', 'b')).toEqual(['off', 'on+p']);
		await answerReads();
		await expect.poll(() => looks('a', 'b'), poll).toEqual(['off', 'on']);
	});

	// The failed press's later write to the shared list cannot be told from the answered press's, so it waits with it.
	test.fails(`${mode}: today: on a shared list, a save that fails after another answered keeps its row until that reload`, async () => {
		await ready(mode, 'shared');
		await press('[data-flip="a"]', () => looks('a', 'b'), ['on+p', 'off']);
		await press('[data-flip="b"]', () => looks('a', 'b'), ['on+p', 'on+p']);
		await answerSave('flip b');
		await frames(3);
		await answerSave('flip a', false);
		await expect.poll(() => looks('a', 'b'), { ...poll, timeout: 1_000 }).toEqual(['off', 'on+p']);
	});

	test(`${mode}: a save that fails after another answered releases its row at once`, async () => {
		await ready(mode, 'rowState');
		await press('[data-flip="a"]', () => looks('a', 'b'), ['on+p', 'off']);
		await press('[data-flip="b"]', () => looks('a', 'b'), ['on+p', 'on+p']);
		await answerSave('flip b');
		await frames(3);
		await answerSave('flip a', false);
		await expect.poll(() => looks('a', 'b'), poll).toEqual(['off', 'on+p']);
		await answerReads();
		await expect.poll(() => looks('a', 'b'), poll).toEqual(['off', 'on']);
	});

	// A loading reload a new save finds is held until that save answers, so the earlier row keeps its look until then.
	async function startDuringReload(mode: Mode, page: 'rowState' | 'rowCallback') {
		await ready(mode, page);
		const stop = watch(() => looks('a', 'b'));
		await press('[data-flip="a"]', () => looks('a', 'b'), ['on+p', 'off']);
		await answerSave('flip a');
		await expect.poll(() => server.reads.length, poll).toBeGreaterThan(0);
		const firstReload = server.reads.splice(0);
		await press('[data-flip="b"]', () => looks('a', 'b'), ['on+p', 'on+p']);
		for (const read of firstReload) read.answer();
		await frames(5);
		await answerSave('flip b');
		await answerReads();
		await expect.poll(() => looks('a', 'b'), poll).toEqual(['on', 'on']);
		const rows = seen((await stop()).changes);
		return { a: column(rows, 0), b: column(rows, 1) };
	}
	test(`${mode}: a save started while an earlier save's reload loads shows at once, and the earlier row keeps its look`, async () => {
		expect(await startDuringReload(mode, 'rowState')).toEqual({ a: ['off', 'on+p', 'on'], b: ['off', 'on+p', 'on'] });
	});
	// A newer press that replaces a whole shared list shows what code holds now, which no longer lists the earlier row.
	test.fails(`${mode}: today: a shared list replaced whole by a press during an earlier save's reload drops the earlier row's look`, async () => {
		expect(await startDuringReload(mode, 'rowCallback')).toEqual({ a: ['off', 'on+p', 'on'], b: ['off', 'on+p', 'on'] });
	});

	test(`${mode}: a save sent after another save's answer left the page ends its busy mark, though an older save answered first`, async () => {
		await ready(mode, 'shared');
		await press('[data-flip="a"]', () => looks('a', 'b'), ['on+p', 'off']);
		click('[data-leave]');
		await answerSave('leave');
		await frames(3);
		await press('[data-flip="b"]', () => looks('a', 'b'), ['on+p', 'on+p']);
		const later = document.querySelector('[data-flip="b"]')!;
		expect(later.getAttribute('aria-busy')).toBe('true');
		await answerSave('flip a');
		await frames(3);
		await answerSave('flip b');
		await answerReads();
		await expect.poll(() => later.getAttribute('aria-busy'), poll).toBe(null);
		await expect.poll(() => looks('a', 'b'), poll).toEqual(['on', 'on']);
	});

	// A value created by the arm itself cannot be built here yet (MARKLESS_PRERENDER_BRANCH_MISSING); graph-paint-hold covers its first read.
	test(`${mode}: an async value keyed on a held state, shown by an arm that opens during the hold, loads once with the new value`, async () => {
		await ready(mode, 'detail', '[data-pick]');
		await press('[data-pick]', () => text('[data-picked]'), 'saving');
		// A client-rendered page loads the value at mount and again for the handler's own write; only later requests count.
		await frames(3);
		const before = server.details.length;
		await answerSave('flip a');
		await expect.poll(() => server.details.length, poll).toBeGreaterThan(before);
		await frames(5);
		expect(text('[data-picked]')).toBe('saving');
		for (let round = 0; round < 3; round++) {
			for (const read of server.reads.splice(0)) read.answer();
			await frames(5);
		}
		await expect.poll(() => [text('[data-picked]'), text('[data-detail]')], poll).toEqual(['b', 'b']);
		expect(server.details.slice(before)).toEqual(['b']);
	});

	test(`${mode}: one failure among three overlapping saves releases at once, and the other two hold until the reload`, async () => {
		await ready(mode, 'rowState');
		const stop = watch(() => looks('a', 'b', 'c'));
		await press('[data-flip="a"]', () => looks('a', 'b', 'c'), ['on+p', 'off', 'off']);
		await press('[data-flip="b"]', () => looks('a', 'b', 'c'), ['on+p', 'on+p', 'off']);
		await press('[data-flip="c"]', () => looks('a', 'b', 'c'), ['on+p', 'on+p', 'on+p']);
		await answerSave('flip a');
		await answerSave('flip b', false);
		await expect.poll(() => looks('a', 'b', 'c'), poll).toEqual(['on+p', 'off', 'on+p']);
		await answerSave('flip c');
		await expect.poll(() => server.reads.length, poll).toBeGreaterThan(0);
		await frames(5);
		expect(looks('a', 'b', 'c')).toEqual(['on+p', 'off', 'on+p']);
		await answerReads();
		await expect.poll(() => looks('a', 'b', 'c'), poll).toEqual(['on', 'off', 'on']);
		const rows = seen((await stop()).changes);
		expect([column(rows, 0), column(rows, 2)]).toEqual([
			['off', 'on+p', 'on'],
			['off', 'on+p', 'on'],
		]);
	});

	test(`${mode}: a save that has not answered keeps the others held, with no reload, until it answers`, async () => {
		await ready(mode, 'rowState');
		await press('[data-flip="a"]', () => looks('a', 'b'), ['on+p', 'off']);
		await press('[data-flip="b"]', () => looks('a', 'b'), ['on+p', 'on+p']);
		const reads = server.readsSent;
		await answerSave('flip b');
		await frames(10);
		expect([looks('a', 'b'), server.readsSent]).toEqual([['on+p', 'on+p'], reads]);
		await answerSave('flip a');
		await answerReads();
		await expect.poll(() => looks('a', 'b'), poll).toEqual(['on', 'on']);
	});

	async function tagDuringHold(mode: Mode) {
		await ready(mode, 'edges', '[data-tag]');
		await press('[data-add-tag]', () => text('[data-label]'), 'saving');
		await answerSave('flip a');
		await expect.poll(() => texts('[data-tag]').length, poll).toBe(2);
		await answerReads();
		await expect.poll(() => text('[data-label]'), poll).toBe('saved');
		await frames(3);
	}
	test(`${mode}: a row created while a state is held leaves the state's written value alone`, async () => {
		await tagDuringHold(mode);
		expect(text('[data-label]')).toBe('saved');
	});
	// Client-rendered only: the row is built while the page paints, so a state it seeds from a held prop starts from the shown value.
	(mode === 'CSR' ? test.fails : test)(`${mode}: a row created while a state is held seeds its own state from the new value`, async () => {
		await tagDuringHold(mode);
		expect(texts('[data-tag]')).toEqual(['ready', 'saved']);
	});

	test(`${mode}: a state written after the save, read beside the held one, does not show the held one early`, async () => {
		await ready(mode, 'shared');
		const stop = watch(() => [look('a'), document.querySelector<HTMLElement>('[data-flag="a"]')!.dataset.note]);
		await press('[data-flip-note="a"]', () => look('a'), 'on+p');
		await answerSave('flip a');
		await expect.poll(() => server.reads.length, poll).toBeGreaterThan(0);
		await frames(5);
		expect(look('a')).toBe('on+p');
		await answerReads();
		await expect.poll(() => look('a'), poll).toBe('on');
		// The note, which nothing holds, shows at once beside the row's held look.
		expect(seen((await stop()).changes)).toEqual([
			['off', ''],
			['on+p', ''],
			['on+p', 'saved'],
			['on', 'saved'],
		]);
	});
}
