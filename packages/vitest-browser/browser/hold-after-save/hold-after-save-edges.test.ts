import { afterEach, beforeEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { poll } from '../back-revalidate/support.ts';
import AddPage from './add-page.tsrx';
import AfterSavePage from './after-save-page.tsrx';
import HiddenListPage from './hidden-list-page.tsrx';
import { installServer, resetServer, server } from './server.ts';
import {
	answerSaveHoldReload,
	click,
	frames,
	hold,
	releaseHolds,
	text,
	watch,
	where,
} from './support.ts';

// When a held state is released, and what reads it meanwhile, around the save a handler sends.
installServer();
beforeEach(() => resetServer());
afterEach(async () => {
	releaseHolds();
	await cleanup();
});

type Mode = 'CSR' | 'SSR';
const MODES: Mode[] = ['CSR', 'SSR'];
const mount = {
	after: { CSR: () => render(AfterSavePage), SSR: () => renderSSR(AfterSavePage) },
	hidden: { CSR: () => render(HiddenListPage), SSR: () => renderSSR(HiddenListPage) },
};

async function ready(mode: Mode, page: keyof typeof mount) {
	await mount[page][mode]();
	await expect.poll(() => document.querySelector('[data-todo]'), poll).not.toBeNull();
	document.querySelector<HTMLElement>('button')!.focus();
}

// Saves, answers it and holds the reload, while the handler's later work waits too.
async function saveThenKeepWorking() {
	const saved = hold();
	const working = hold();
	server.holdSaves = saved.promise;
	server.holdHandler = working.promise;
	click('[data-then-wait]');
	await expect.poll(() => text('[data-status]'), poll).toBe('Saving');
	const reload = await answerSaveHoldReload(saved);
	return { reload, working };
}

for (const mode of MODES) {
	test(`${mode}: a handler still working after its save shows "Saved" with the reloaded data, then moves on`, async () => {
		await ready(mode, 'after');
		const button = document.querySelector('[data-then-wait]')!;
		const stop = watch(() => [text('[data-status]'), where('Bread'), button.getAttribute('aria-busy')]);
		const { reload, working } = await saveThenKeepWorking();
		await frames(5);
		expect(text('[data-status]')).toBe('Saving');
		reload.resolve();
		await expect.poll(() => where('Bread'), poll).toBe('saved');
		expect(text('[data-status]')).toBe('Saved');
		await frames(3);
		working.resolve();
		await expect.poll(() => text('[data-status]'), poll).toBe('Ready');
		const { painted } = await stop();
		// The button stays busy from the save until the handler returns.
		expect(painted.slice(painted.findIndex(([status]) => status === 'Saving'))).toEqual([
			['Saving', 'none', 'true'],
			['Saved', 'saved', 'true'],
			['Ready', 'saved', null],
		]);
	});

	test.fails(`${mode}: today: a handler that moves on before the reload lands skips "Saved"`, async () => {
		await ready(mode, 'after');
		const stop = watch(() => text('[data-status]'));
		const { reload, working } = await saveThenKeepWorking();
		working.resolve();
		await frames(3);
		reload.resolve();
		await expect.poll(() => where('Bread'), poll).toBe('saved');
		await expect.poll(() => text('[data-status]'), poll).toBe('Ready');
		expect((await stop()).painted).toContain('Saved');
	});

	test(`${mode}: a handler that writes a held state and then changes what the list reads loads it once`, async () => {
		await ready(mode, 'after');
		const reads = server.reads;
		click('[data-bump]');
		await expect.poll(() => where('Jam'), poll).toBe('saved');
		await expect.poll(() => text('[data-status]'), poll).toBe('Saved');
		await frames(5);
		expect(server.reads).toBe(reads + 1);
	});

	test(`${mode}: a timer writing the state while the save is still out paints at once`, async () => {
		await ready(mode, 'after');
		const saved = hold();
		server.holdSaves = saved.promise;
		click('[data-timer]');
		await expect.poll(() => Number(text('[data-ticks]')), poll).toBeGreaterThan(2);
		saved.resolve();
		await expect.poll(() => where('Tea'), poll).toBe('saved');
	});

	test(`${mode}: two saves in one handler: "Saved" lands with both rows, after one reload`, async () => {
		await ready(mode, 'after');
		const reads = server.reads;
		const reload = hold();
		server.holdReads = reload.promise;
		const stop = watch(() => [text('[data-status]'), where('Oats'), where('Rice')]);
		const first = hold();
		server.holdSaves = first.promise;
		click('[data-two]');
		await expect.poll(() => text('[data-status]'), poll).toBe('Saving');
		server.holdSaves = undefined;
		first.resolve();
		await expect.poll(() => server.reads, poll).toBe(reads + 1);
		await frames(3);
		expect(text('[data-status]')).toBe('Saving');
		reload.resolve();
		await expect.poll(() => where('Rice'), poll).toBe('saved');
		await frames(3);
		expect(server.reads).toBe(reads + 1);
		const { painted } = await stop();
		expect(painted.slice(painted.findIndex(([status]) => status === 'Saving'))).toEqual([
			['Saving', 'none', 'none'],
			['Saved', 'saved', 'saved'],
		]);
	});

	test(`${mode}: an aborted save releases at once, with no reload`, async () => {
		await ready(mode, 'after');
		const reads = server.reads;
		server.holdSaves = hold().promise;
		click('[data-abortable]');
		await expect.poll(() => text('[data-status]'), poll).toBe('Saving');
		click('[data-abort]');
		await expect.poll(() => text('[data-status]'), poll).toBe('Aborted');
		await frames(3);
		expect(server.reads).toBe(reads);
	});

	test(`${mode}: another handler writing the held state after an await waits for the reload`, async () => {
		await ready(mode, 'after');
		const { reload } = await saveThenKeepWorking();
		click('[data-cancel]');
		await frames(5);
		expect(text('[data-status]')).toBe('Saving');
		reload.resolve();
		await expect.poll(() => text('[data-status]'), poll).toBe('Cancelled');
	});

	test(`${mode}: a handler reading the held state gets the new value, and a computed over it the old one`, async () => {
		await ready(mode, 'after');
		const { reload } = await saveThenKeepWorking();
		click('[data-read]');
		await expect.poll(() => text('[data-seen]'), poll).toBe('Saved/SAVING');
		reload.resolve();
		await expect.poll(() => text('[data-status]'), poll).toBe('Saved');
		click('[data-read]');
		await expect.poll(() => text('[data-seen]'), poll).toBe('Saved/SAVED');
	});

	test.fails(`${mode}: today: a reader of the held state and of a state changed meanwhile shows the new held value early`, async () => {
		await ready(mode, 'after');
		const { reload } = await saveThenKeepWorking();
		const field = document.querySelector<HTMLInputElement>('[data-draft]')!;
		field.value = 'x';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		await expect.poll(() => text('[data-both]')?.endsWith('x'), poll).toBe(true);
		const both = text('[data-both]');
		reload.resolve();
		expect(both).toBe('Saving x');
	});

	test(`${mode}: an arm closed while its reload loads still releases the held state when the reload lands`, async () => {
		await ready(mode, 'hidden');
		const saved = hold();
		server.holdSaves = saved.promise;
		click('[data-add]');
		await expect.poll(() => text('[data-outside]'), poll).toBe('Bread');
		const reload = await answerSaveHoldReload(saved);
		click('[data-hide]');
		await expect.poll(() => document.querySelector('[data-todo]'), poll).toBeNull();
		expect(text('[data-outside]')).toBe('Bread');
		reload.resolve();
		await expect.poll(() => text('[data-outside]'), poll).toBe('idle');
	});
}

// A served page that has not woken: the first press is the one that wakes it.
async function coldFirstPress(press: (button: HTMLElement) => Promise<void> | void) {
	await renderSSR(AddPage);
	const form = document.querySelector('[data-form]')!;
	const saved = hold();
	server.holdSaves = saved.promise;
	const reads = server.reads;
	await press(document.querySelector<HTMLElement>('[data-add]')!);
	await expect.poll(() => where('Bread'), poll).toBe('saving');
	await frames(2);
	const busy = form.getAttribute('aria-busy') === 'true';
	const reload = hold();
	server.holdReads = reload.promise;
	saved.resolve();
	await expect.poll(() => document.querySelector<HTMLInputElement>('[data-field]')!.value, poll).toBe('');
	await frames(5);
	const facts = { busy, reloaded: server.reads === reads + 1, held: where('Bread') === 'saving' };
	reload.resolve();
	expect(facts).toEqual({ busy: true, reloaded: true, held: true });
}
test('SSR cold: a real pointer press as the first input reloads after the save, marks busy and holds', async () => {
	await coldFirstPress((button) => userEvent.click(button));
});

test('SSR cold: a bare programmatic click as the first input reloads after the save, marks busy and holds', async () => {
	await coldFirstPress((button) => button.click());
});
