import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { loads, resetLoads, server, settleAll, waitingFor } from './api.ts';
import SaveCatchPage from './save-catch-page.tsrx';
import SaveOpenPage from './save-open-page.tsrx';
import SavePage from './save-page.tsrx';

// A save in flight re-asks the values on screen; one whose arm closed meanwhile is gone and must not come back through it.
// The stand-in route is installed once: the runtime wraps fetch once, on the first page it wires.
// Answering a save raises the server's revision, so a load asked after it answers differently; `ok: false` fails it.
const saves: Array<(ok?: boolean) => void> = [];
const real = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	if (new URL(String(input), location.href).pathname !== '/api/arm-notes') return real(input, init);
	return new Promise<Response>((resolve) =>
		saves.push((ok = true) => {
			if (ok) server.revision++;
			resolve(ok ? Response.json({ ok: true }) : new Response('no', { status: 500 }));
		}),
	);
}) as typeof fetch;
beforeEach(resetLoads);
afterEach(async () => {
	for (const answer of saves.splice(0)) answer();
	await cleanup();
});

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const panel = () => {
	const section = document.querySelector('[data-panel="save"]');
	return section ? (section.querySelector('[data-name]') ?? section.querySelector('[data-loading]'))!.textContent!.trim() : null;
};
const busy = () => [...document.querySelectorAll('[aria-busy="true"]')].map((element) => element.outerHTML);
async function passes() {
	for (let at = 0; at < 3; at++) await new Promise((resolve) => setTimeout(resolve, 0));
}
const pages = {
	opened: { CSR: () => render(SavePage), SSR: () => renderSSR(SavePage) },
	openAtLoad: { CSR: () => render(SaveOpenPage), SSR: () => renderSSR(SaveOpenPage) },
	caught: { CSR: () => render(SaveCatchPage), SSR: () => renderSSR(SaveCatchPage) },
};

const orders = ['closed while the save is out, reopened after it answers', 'closed and reopened while the save is out', 'closed while the save\'s re-fetch runs'] as const;

for (const mode of ['CSR', 'SSR'] as const)
	for (const [shape, page] of [
		['opened by a click', pages.opened],
		['open in the first render', pages.openAtLoad],
	] as const)
		for (const order of orders)
			test(`${mode}, arm ${shape}, ${order}: nothing lands on the closed arm, no busy mark stays, and the reopened arm loads afresh`, async () => {
				await page[mode]();
				if (shape === 'opened by a click') click('[data-open]');
				if (mode === 'CSR' || shape === 'opened by a click') {
					await expect.poll(() => waitingFor('save', 1)).toBe(1);
					settleAll('save', 1);
				}
				await expect.poll(panel).toBe('save 1');
				click('[data-save]');
				await expect.poll(() => saves.length).toBe(1);
				if (order === orders[2]) {
					const before = loads.length;
					saves.shift()!();
					await expect.poll(() => waitingFor('save', 1)).toBe(1);
					expect(loads.length).toBe(before + 1);
				}
				const before = loads.length;
				click('[data-close]');
				await expect.poll(panel).toBeNull();
				if (order === orders[1]) click('[data-open]');
				else {
					saves.shift()?.();
					settleAll('save', 1);
					await passes();
					expect(loads.slice(before)).toEqual([]);
					await expect.poll(busy).toEqual([]);
					click('[data-open]');
				}
				await expect.poll(panel).toBe('Loading');
				if (order === orders[1]) saves.shift()!();
				await expect.poll(() => waitingFor('save', 1)).toBeGreaterThan(0);
				settleAll('save', 1);
				await expect.poll(panel).toBe('save 1 r1');
				await passes();
				expect(waitingFor('save', 1)).toBe(0);
				await expect.poll(busy).toEqual([]);
				expect(loads.slice(before).length).toBeLessThanOrEqual(2);
			});


async function opened(mode: 'CSR' | 'SSR', page: Record<'CSR' | 'SSR', () => Promise<unknown>>, clicked: boolean) {
	await page[mode]();
	if (clicked) click('[data-open]');
	if (mode === 'CSR' || clicked) {
		await expect.poll(() => waitingFor('save', 1)).toBe(1);
		settleAll('save', 1);
	}
	await expect.poll(panel).toBe('save 1');
}

for (const mode of ['CSR', 'SSR'] as const)
	for (const [shape, page, clicked] of [
		['opened by a click', pages.opened, true],
		['open in the first render', pages.openAtLoad, false],
	] as const) {
		for (const reopened of ['answered before the save lands', 'still loading when the save lands'] as const)
			test(`${mode}, arm ${shape}: reopened while a save is out, its load ${reopened}, the arm ends on what the save wrote`, async () => {
				await opened(mode, page, clicked);
				click('[data-save]');
				await expect.poll(() => saves.length).toBe(1);
				click('[data-close]');
				await expect.poll(panel).toBeNull();
				click('[data-open]');
				await expect.poll(() => waitingFor('save', 1)).toBe(1);
				if (reopened === 'answered before the save lands') {
					settleAll('save', 1);
					await expect.poll(panel).toBe('save 1');
				}
				saves.shift()!();
				for (let round = 0; round < 3; round++) {
					await passes();
					settleAll('save', 1);
				}
				await expect.poll(panel).toBe('save 1 r1');
				await expect.poll(busy).toEqual([]);
			});

		test(`${mode}, arm ${shape}: two saves in flight with a close between them leave no busy mark, and a reopen shows both`, async () => {
			await opened(mode, page, clicked);
			click('[data-save]');
			await expect.poll(() => saves.length).toBe(1);
			click('[data-close]');
			await expect.poll(panel).toBeNull();
			click('[data-save]');
			await expect.poll(() => saves.length).toBe(2);
			saves.shift()!();
			await passes();
			saves.shift()!();
			await passes();
			await expect.poll(busy).toEqual([]);
			expect(waitingFor('save', 1)).toBe(0);
			click('[data-open]');
			await expect.poll(() => waitingFor('save', 1)).toBe(1);
			settleAll('save', 1);
			await expect.poll(panel).toBe('save 1 r2');
			await expect.poll(busy).toEqual([]);
		});
	}

for (const mode of ['CSR', 'SSR'] as const)
	test(`${mode}: a save that fails while the arm is closed shows in the page's @catch, not the closed arm's, and leaves no busy mark`, async () => {
		await pages.caught[mode]();
		if (mode === 'CSR') {
			await expect.poll(() => waitingFor('shelf', 0)).toBe(1);
			settleAll('shelf', 0);
			await expect.poll(() => waitingFor('save', 1)).toBe(1);
			settleAll('save', 1);
		}
		await expect.poll(panel).toBe('save 1');
		click('[data-save]');
		await expect.poll(() => saves.length).toBe(1);
		click('[data-close]');
		await expect.poll(panel).toBeNull();
		saves.shift()!(false);
		await expect.poll(() => document.querySelector('[data-page-failed]')?.textContent).toBe('Saving failed (500)');
		expect(document.querySelector('[data-panel-failed]')).toBeNull();
		await expect.poll(busy).toEqual([]);
	});
