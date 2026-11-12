import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll } from '../back-revalidate/support.ts';
import AddPage from './add-page.tsrx';
import ComponentRowsPage from './component-rows-page.tsrx';
import DeletePage from './delete-page.tsrx';
import DialogPage from './dialog-page.tsrx';
import HiddenListPage from './hidden-list-page.tsrx';
import LikePage from './like-page.tsrx';
import PlainPage from './plain-page.tsrx';
import RenamePage from './rename-page.tsrx';
import { installServer, resetServer, server } from './server.ts';
import SharedListPage from './shared-list-page.tsrx';

// State a handler set before its save shows its earlier value until the reload after that save is on screen.
installServer();
beforeEach(() => resetServer());
// Every hold a test made is let go, so a failed test leaves no read or save waiting into the next.
const holds: Array<{ resolve: (value: void) => void }> = [];
function hold() {
	const held = deferred<void>();
	holds.push(held);
	return held;
}
afterEach(async () => {
	server.holdReads = undefined;
	server.holdSaves = undefined;
	for (const held of holds.splice(0)) held.resolve();
	await cleanup();
});

type Mode = 'CSR' | 'SSR';
const MODES: Mode[] = ['CSR', 'SSR'];
const mount = {
	add: { CSR: () => render(AddPage), SSR: () => renderSSR(AddPage) },
	componentRows: {
		CSR: () => render(ComponentRowsPage),
		SSR: () => renderSSR(ComponentRowsPage),
	},
	like: { CSR: () => render(LikePage), SSR: () => renderSSR(LikePage) },
	rename: { CSR: () => render(RenamePage), SSR: () => renderSSR(RenamePage) },
	remove: { CSR: () => render(DeletePage), SSR: () => renderSSR(DeletePage) },
	dialog: { CSR: () => render(DialogPage), SSR: () => renderSSR(DialogPage) },
	shared: { CSR: () => render(SharedListPage), SSR: () => renderSSR(SharedListPage) },
	plain: { CSR: () => render(PlainPage), SSR: () => renderSSR(PlainPage) },
	hidden: { CSR: () => render(HiddenListPage), SSR: () => renderSSR(HiddenListPage) },
};

const texts = (selector: string) =>
	[...document.querySelectorAll(selector)].map((node) => node.textContent!.trim());
const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
async function frames(count: number) {
	for (let at = 0; at < count; at++) await frame();
}

// Where a title is on screen: as a saved row, as a "saving" row, both, or nowhere.
function where(title: string): 'saved' | 'saving' | 'both' | 'none' {
	const saved = texts('[data-todo]').some((row) => row.startsWith(title));
	const saving = texts('[data-saving]').includes(title);
	return saved && saving ? 'both' : saved ? 'saved' : saving ? 'saving' : 'none';
}

type Seen<T> = { frame: number; value: T };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
// What `look` answers at every animation frame (what is painted) and after every DOM change, each change of answer once.
function watch<T>(look: () => T) {
	const changes: Array<Seen<T>> = [];
	const painted: T[] = [];
	let frame = 0;
	let running = true;
	const record = () => {
		const value = look();
		if (!changes.length || !same(changes.at(-1)!.value, value)) changes.push({ frame, value });
		return value;
	};
	const tick = () => {
		if (!running) return;
		frame++;
		const value = record();
		if (!painted.length || !same(painted.at(-1), value)) painted.push(value);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const observer = new MutationObserver(record);
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
	});
	tick();
	return async () => {
		await settled();
		running = false;
		observer.disconnect();
		return { changes, painted };
	};
}
const settled = () =>
	new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

// Answers the next save, then holds the reload it causes until the returned release runs.
async function answerSaveHoldReload(saved: { resolve: (value: void) => void }) {
	const reload = hold();
	const reads = server.reads;
	server.holdReads = reload.promise;
	saved.resolve();
	await expect.poll(() => server.reads, poll).toBe(reads + 1);
	return reload;
}

// A served page wakes on its first focus, as the sibling write-watch suites do, so the save is sent by a wired page.
async function ready(mode: Mode, page: keyof typeof mount, selector = '[data-todo]') {
	await mount[page][mode]();
	await expect.poll(() => document.querySelector(selector), poll).not.toBeNull();
	document.querySelector<HTMLElement>('button')!.focus();
}

for (const mode of MODES) {
	test(`${mode}: a "saving" row stays until the saved row is on screen, then swaps in the same frame`, async () => {
		await ready(mode, 'add');
		const form = document.querySelector('[data-form]')!;
		const saved = hold();
		server.holdSaves = saved.promise;
		const stop = watch(() => ({
			bread: where('Bread'),
			status: text('[data-status]'),
			outside: text('[data-outside]'),
			disabled: document.querySelector<HTMLButtonElement>('[data-add]')!.disabled,
			busy: form.getAttribute('aria-busy') === 'true',
		}));
		click('[data-add]');
		await expect.poll(() => where('Bread'), poll).toBe('saving');
		const reload = await answerSaveHoldReload(saved);
		await frames(10);
		expect(where('Bread')).toBe('saving');
		// The field was not set in the handler's own run, so it clears as soon as the save answers.
		expect(document.querySelector<HTMLInputElement>('[data-field]')!.value).toBe('');
		reload.resolve();
		await expect.poll(() => where('Bread'), poll).toBe('saved');
		await expect.poll(() => form.getAttribute('aria-busy'), poll).toBe(null);
		const { painted } = await stop();
		expect(painted.slice(painted.findIndex((frame) => frame.bread === 'saving'))).toEqual([
			{ bread: 'saving', status: 'Saving', outside: 'Bread', disabled: true, busy: true },
			{ bread: 'saved', status: 'Saved', outside: 'idle', disabled: false, busy: false },
		]);
	});

	test(`${mode}: a second add as soon as Add is enabled again, and neither row ever blinks`, async () => {
		await ready(mode, 'add');
		const stop = watch(() => [where('Bread'), where('Butter')]);
		const first = hold();
		server.holdSaves = first.promise;
		click('[data-add]');
		await expect.poll(() => where('Bread'), poll).toBe('saving');
		const reload = await answerSaveHoldReload(first);
		server.holdSaves = undefined;
		server.holdReads = undefined;
		await frames(5);
		reload.resolve();
		const field = document.querySelector<HTMLInputElement>('[data-field]')!;
		await expect
			.poll(() => document.querySelector<HTMLButtonElement>('[data-add]')!.disabled, poll)
			.toBe(false);
		field.value = 'Butter';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		click('[data-add]');
		await expect.poll(() => where('Butter'), poll).toBe('saved');
		const { painted } = await stop();
		// A fast second save may show and settle within one frame; neither row may ever be missing once shown.
		const breadShown = painted.findIndex(([bread]) => bread !== 'none');
		const butterShown = painted.findIndex(([, butter]) => butter !== 'none');
		expect(
			painted.slice(breadShown).every(([bread]) => bread === 'saving' || bread === 'saved'),
		).toBe(true);
		expect(
			painted
				.slice(butterShown)
				.every(([, butter]) => butter === 'saving' || butter === 'saved'),
		).toBe(true);
		expect(painted.at(-1)).toEqual(['saved', 'saved']);
	});

	test(`${mode}: a failed save removes the row and shows the error at once, with nothing held`, async () => {
		await ready(mode, 'add');
		const field = document.querySelector<HTMLInputElement>('[data-field]')!;
		field.value = 'fail Bread';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		const saved = hold();
		server.holdSaves = saved.promise;
		click('[data-add]');
		await expect.poll(() => where('fail Bread'), poll).toBe('saving');
		const reads = server.reads;
		const stop = watch(() => [
			where('fail Bread'),
			text('[data-failure]'),
			text('[data-status]'),
			text('[data-outside]'),
		]);
		saved.resolve();
		await expect.poll(() => text('[data-failure]'), poll).toBe('Could not save fail Bread');
		const { painted, changes } = await stop();
		expect(server.reads).toBe(reads);
		const expected = [
			['saving', null, 'Saving', 'fail Bread'],
			['none', 'Could not save fail Bread', 'Failed', 'idle'],
		];
		expect(painted).toEqual(expected);
		expect(changes.map((change) => change.value)).toEqual(expected);
	});

	test(`${mode}: a reload that fails releases the held row when it fails, not before`, async () => {
		await ready(mode, 'add');
		const saved = hold();
		server.holdSaves = saved.promise;
		server.failReads = 1;
		click('[data-add]');
		await expect.poll(() => text('[data-outside]'), poll).toBe('Bread');
		const reload = await answerSaveHoldReload(saved);
		const stop = watch(() => text('[data-outside]'));
		await frames(5);
		expect(text('[data-outside]')).toBe('Bread');
		reload.resolve();
		await expect.poll(() => text('[data-outside]'), poll).toBe('idle');
		expect((await stop()).painted).toEqual(['Bread', 'idle']);
	});

	test(`${mode}: a newer handler's own write to a held state shows at once`, async () => {
		await ready(mode, 'add');
		const saved = hold();
		server.holdSaves = saved.promise;
		click('[data-add]');
		await expect.poll(() => text('[data-status]'), poll).toBe('Saving');
		const reload = await answerSaveHoldReload(saved);
		await frames(2);
		expect(text('[data-status]')).toBe('Saving');
		click('[data-dismiss]');
		await expect.poll(() => text('[data-status]'), poll).toBe('Ready');
		expect(where('Bread')).toBe('saving');
		reload.resolve();
		await expect.poll(() => where('Bread'), poll).toBe('saved');
		await frames(2);
		expect(text('[data-status]')).toBe('Ready');
	});

	test(`${mode}: a page removed while a write is held goes without errors`, async () => {
		await ready(mode, 'add');
		const saved = hold();
		server.holdSaves = saved.promise;
		click('[data-add]');
		await expect.poll(() => where('Bread'), poll).toBe('saving');
		const reload = await answerSaveHoldReload(saved);
		await cleanup();
		reload.resolve();
		server.holdReads = undefined;
		server.holdSaves = undefined;
		await frames(2);
		await ready(mode, 'add');
		click('[data-add]');
		await expect.poll(() => text('[data-status]'), poll).toBe('Saved');
	});

	test(`${mode}: component rows: the "saving" row component stays until the saved row component is on screen`, async () => {
		await ready(mode, 'componentRows');
		const saved = hold();
		server.holdSaves = saved.promise;
		const stop = watch(() => where('Bread'));
		click('[data-add]');
		await expect.poll(() => where('Bread'), poll).toBe('saving');
		const reload = await answerSaveHoldReload(saved);
		await frames(5);
		expect(where('Bread')).toBe('saving');
		reload.resolve();
		await expect.poll(() => where('Bread'), poll).toBe('saved');
		expect((await stop()).painted).toEqual(['none', 'saving', 'saved']);
	});

	test(`${mode}: a like keeps its new count through the reload`, async () => {
		await ready(mode, 'like', '[data-likes]');
		await expect.poll(() => text('[data-likes]'), poll).toBe('3');
		const saved = hold();
		server.holdSaves = saved.promise;
		const stop = watch(() => text('[data-likes]'));
		click('[data-like]');
		await expect.poll(() => text('[data-likes]'), poll).toBe('4');
		const reload = await answerSaveHoldReload(saved);
		await frames(5);
		expect(text('[data-likes]')).toBe('4');
		reload.resolve();
		await expect.poll(() => text('[data-server]'), poll).toBe('4');
		expect((await stop()).painted).toEqual(['3', '4']);
	});

	test(`${mode}: a rename closes its editor at once and never shows the old title again`, async () => {
		await ready(mode, 'rename', '[data-title]');
		click('[data-edit]');
		await expect.poll(() => document.querySelector('[data-rename]'), poll).not.toBeNull();
		const saved = hold();
		server.holdSaves = saved.promise;
		const stop = watch(() => [
			text('[data-title]'),
			document.querySelector('[data-rename]') !== null,
		]);
		click('[data-rename]');
		await expect.poll(() => text('[data-title]'), poll).toBe('Pantry');
		const reload = await answerSaveHoldReload(saved);
		// `editing` was set by the Rename button, not by the save's handler, so the editor closes now.
		await expect.poll(() => document.querySelector('[data-rename]'), poll).toBeNull();
		await frames(5);
		expect(text('[data-title]')).toBe('Pantry');
		reload.resolve();
		await expect.poll(() => text('[data-server]'), poll).toBe('Pantry');
		const { painted } = await stop();
		const renamed = painted.findIndex(([title]) => title === 'Pantry');
		expect(painted.slice(0, renamed)).toEqual([['Groceries', true]]);
		expect(painted.slice(renamed).every(([title]) => title === 'Pantry')).toBe(true);
		expect(painted.at(-1)).toEqual(['Pantry', false]);
	});

	test(`${mode}: a deleted row goes and stays gone`, async () => {
		await ready(mode, 'remove');
		const saved = hold();
		server.holdSaves = saved.promise;
		const stop = watch(() => texts('[data-todo]').length);
		click('[data-delete]');
		await expect.poll(() => texts('[data-todo]').length, poll).toBe(0);
		const reload = await answerSaveHoldReload(saved);
		await frames(5);
		reload.resolve();
		await expect.poll(() => text('[data-server]'), poll).toBe('0');
		expect((await stop()).painted).toEqual([1, 0]);
	});

	test(`${mode}: a dialog closes as soon as its save answers`, async () => {
		await ready(mode, 'dialog');
		click('[data-open]');
		await expect.poll(() => document.querySelector('[data-dialog]'), poll).not.toBeNull();
		const saved = hold();
		server.holdSaves = saved.promise;
		click('[data-save]');
		await expect.poll(() => text('[data-save]'), poll).toBe('Saving');
		const reload = await answerSaveHoldReload(saved);
		await expect.poll(() => document.querySelector('[data-dialog]'), poll).toBeNull();
		expect(texts('[data-todo]')).toEqual(['Milk']);
		reload.resolve();
		await expect.poll(() => texts('[data-todo]'), poll).toEqual(['Milk', 'Tea']);
	});

	test(`${mode}: a page switch written after the save shows at once`, async () => {
		await ready(mode, 'dialog');
		const saved = hold();
		server.holdSaves = saved.promise;
		click('[data-finish]');
		await expect.poll(() => text('[data-finish]'), poll).toBe('Saving');
		const reload = await answerSaveHoldReload(saved);
		await expect.poll(() => text('[data-done]'), poll).toBe('All saved');
		reload.resolve();
	});

	test(`${mode}: a list several handlers share is not worse than before`, async () => {
		await ready(mode, 'shared');
		const first = hold();
		server.holdSaves = first.promise;
		click('[data-add]');
		await expect.poll(() => where('Bread'), poll).toBe('saving');
		const reload = await answerSaveHoldReload(first);
		const second = hold();
		server.holdSaves = second.promise;
		click('[data-add]');
		await expect.poll(() => where('Butter'), poll).toBe('saving');
		server.holdReads = undefined;
		reload.resolve();
		second.resolve();
		await expect
			.poll(() => [where('Bread'), where('Butter')], poll)
			.toEqual(['saved', 'saved']);
		await frames(3);
		expect(texts('[data-todo]')).toEqual(['Milk', 'Bread', 'Butter']);
		expect(texts('[data-saving]')).toEqual([]);
	});

	test(`${mode}: a page with nothing to load again shows the write at once`, async () => {
		await ready(mode, 'plain', '[data-outside]');
		const saved = hold();
		server.holdSaves = saved.promise;
		click('[data-add]');
		await expect.poll(() => text('[data-outside]'), poll).toBe('Bread');
		saved.resolve();
		await expect.poll(() => text('[data-outside]'), poll).toBe('idle');
	});

	test(`${mode}: a save while the only async list is closed shows the write at once`, async () => {
		await ready(mode, 'hidden');
		click('[data-hide]');
		await expect.poll(() => document.querySelector('[data-todo]'), poll).toBeNull();
		const reads = server.reads;
		const reload = hold();
		server.holdReads = reload.promise;
		const saved = hold();
		server.holdSaves = saved.promise;
		click('[data-add]');
		await expect.poll(() => text('[data-outside]'), poll).toBe('Bread');
		saved.resolve();
		await expect.poll(() => text('[data-outside]'), poll).toBe('idle');
		expect(server.reads).toBe(reads);
		reload.resolve();
	});
}
