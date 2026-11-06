import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import DetailPage from './detail-page.tsrx';
import PricePage from './price-page.tsrx';
import RestartPage from './restart-page.tsrx';

// A component a keyed @for creates in the browser (here, to start it over) keeps taking its own answers, its parent's
// reload, and calls on its async fields, however many times it is created again.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const errors: string[] = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

async function shows(value: string, label: string) {
	await expect
		.poll(() => `${text('[data-value]')} / ${text('[data-label]')}`)
		.toBe(`${value} / ${label}`);
}

async function counterFollowsAnswers() {
	click('[data-bump]');
	await reply('total:1');
	await shows('$10', 'total 10');
	for (let restart = 0; restart < 3; restart++) {
		click('[data-restart]');
		await reply('total:0');
		await shows('$0', 'total 0');
		click('[data-bump]');
		await reply('total:1');
		await shows('$10', 'total 10');
		click('[data-bump]');
		await reply('total:2');
		await shows('$20', 'total 20');
		click('[data-reload]');
		await reply('total:3');
		await shows('$30', 'total 30');
	}
	expect(document.querySelectorAll('[data-value]')).toHaveLength(1);
}

test('CSR: a restarted row takes its later answers and the parent reload', async () => {
	await render(RestartPage);
	await reply('total:0');
	await shows('$0', 'total 0');
	await counterFollowsAnswers();
});

test('SSR: a restarted row takes its later answers and the parent reload after resume', async () => {
	await renderSSR(RestartPage);
	await shows('$0', 'total 0');
	await counterFollowsAnswers();
});

async function priceSurvivesRestarts() {
	errors.length = 0;
	for (let restart = 0; restart < 3; restart++) {
		click('[data-restart]');
		await expect.poll(() => text('[data-price-pending]')).toBe('wait');
		await reply('price:0');
		await expect.poll(() => text('[data-price]')).toBe('$1,240');
		click('[data-again]');
		await reply('price:1');
		await expect.poll(() => text('[data-price]')).toBe('$1,241');
	}
	expect(errors).toEqual([]);
}

test('CSR: a call on a pending async field in a restarted row waits for the answer', async () => {
	await render(PricePage);
	await reply('price:0');
	await expect.poll(() => text('[data-price]')).toBe('$1,240');
	await priceSurvivesRestarts();
});

test('SSR: a call on a pending async field in a restarted row waits for the answer after resume', async () => {
	await renderSSR(PricePage);
	expect(text('[data-price]')).toBe('$1,240');
	await priceSurvivesRestarts();
});

async function detailsFollowReload() {
	click('[data-open]');
	await reply('detail:ada:0');
	await expect.poll(() => text('[data-detail="ada"]')).toBe('ada loaded (reload 0)');
	click('[data-reload]');
	await reply('detail:ada:1');
	await expect.poll(() => text('[data-detail="ada"]')).toBe('ada loaded (reload 1)');
	click('[data-open]');
	await reply('detail:grace:1');
	await expect.poll(() => text('[data-detail="grace"]')).toBe('grace loaded (reload 1)');
	click('[data-reload]');
	await reply('detail:ada:2');
	await reply('detail:grace:2');
	await expect
		.poll(() => [text('[data-detail="ada"]'), text('[data-detail="grace"]')])
		.toEqual(['ada loaded (reload 2)', 'grace loaded (reload 2)']);
}

test('CSR: rows created in the browser read and follow a reload the parent forwards', async () => {
	await render(DetailPage);
	await detailsFollowReload();
});

test('SSR: rows created in the browser read and follow a reload the parent forwards after resume', async () => {
	await renderSSR(DetailPage);
	await detailsFollowReload();
});

import CallPage from './call/page.tsrx';
import StuckPage from './stuck/page.tsrx';

const inA = (selector: string) => `[data-wrapper="a"] ${selector}`;

async function stuckRowFollows() {
	const read = () => `${text(inA('.value'))} / ${text(inA('.label'))}`;
	click(inA('.bump'));
	await reply('total:1');
	await expect.poll(read).toBe('$10 / total 10');
	for (let restart = 0; restart < 3; restart++) {
		click(inA('.restart'));
		await reply('total:0');
		await expect.poll(read).toBe('$0 / total 0');
		click(inA('.bump'));
		await reply('total:1');
		await expect.poll(read).toBe('$10 / total 10');
	}
	expect(text('[data-wrapper="b"] .value')).toBe('$0');
}

test('CSR: a restarted row in an imported wrapper with a children slot takes its later answers', async () => {
	await render(StuckPage);
	await reply('total:0');
	await reply('total:0');
	await stuckRowFollows();
});

test('SSR: a restarted row in an imported wrapper with a children slot takes its later answers after resume', async () => {
	await renderSSR(StuckPage);
	await stuckRowFollows();
});

async function callRowWaits() {
	errors.length = 0;
	for (let restart = 0; restart < 3; restart++) {
		click('#restart');
		await reply('price:0');
		await expect.poll(() => text('.price')).toBe('$1,240');
	}
	expect(errors).toEqual([]);
}

test('CSR: a call on a pending field in a restarted imported row waits for its answer', async () => {
	await render(CallPage);
	await reply('price:0');
	await expect.poll(() => text('.price')).toBe('$1,240');
	await callRowWaits();
});

test('SSR: a call on a pending field in a restarted imported row waits for its answer after resume', async () => {
	await renderSSR(CallPage);
	expect(text('.price')).toBe('$1,240');
	await callRowWaits();
});

import ConstPage from './const-page.tsrx';
import OpenDetailPage from './open-detail-page.tsrx';
import PlainPage from './plain-page.tsrx';

test('CSR: a row created in the browser reads a constant its owner was handed', async () => {
	await render(ConstPage);
	click('[data-open]');
	await reply('detail:ada:7');
	await expect.poll(() => text('[data-detail="ada"]')).toBe('ada loaded (reload 7)');
});

test('SSR: a row created in the browser reads a constant its owner was handed after resume', async () => {
	await renderSSR(ConstPage);
	click('[data-open]');
	await reply('detail:ada:7');
	await expect.poll(() => text('[data-detail="ada"]')).toBe('ada loaded (reload 7)');
});

async function forwardedReloadReaches(selector: string) {
	for (const round of [1, 2]) {
		click('[data-reload]');
		await reply(`detail:ada:${round}`);
		await expect.poll(() => text(selector)).toBe(`ada loaded (reload ${round})`);
	}
}

test('CSR: a served row follows a reload its owner forwards', async () => {
	await render(OpenDetailPage);
	await reply('detail:ada:0');
	await expect.poll(() => text('[data-detail="ada"]')).toBe('ada loaded (reload 0)');
	await forwardedReloadReaches('[data-detail="ada"]');
});

test('SSR: a served row follows a reload its owner forwards after resume', async () => {
	await renderSSR(OpenDetailPage);
	expect(text('[data-detail="ada"]')).toBe('ada loaded (reload 0)');
	await forwardedReloadReaches('[data-detail="ada"]');
});

test('CSR: a component two levels down follows a reload its parent forwards', async () => {
	await render(PlainPage);
	await reply('detail:ada:0');
	await expect.poll(() => text('[data-detail="ada"]')).toBe('ada loaded (reload 0)');
	await forwardedReloadReaches('[data-detail="ada"]');
});

test('SSR: a component two levels down follows a reload its parent forwards after resume', async () => {
	await renderSSR(PlainPage);
	expect(text('[data-detail="ada"]')).toBe('ada loaded (reload 0)');
	await forwardedReloadReaches('[data-detail="ada"]');
});

import BoardPage from './board-page.tsrx';

async function boardFollows() {
	click('[data-range]');
	await reply('figure:30d:0');
	await expect.poll(() => text('[data-figure]')).toBe('30d at 0');
	click('[data-reload]');
	await reply('figure:30d:1');
	await expect.poll(() => text('[data-figure]')).toBe('30d at 1');
	click('[data-restart]');
	await reply('figure:7d:0');
	await expect.poll(() => text('[data-figure]')).toBe('7d at 0');
	click('[data-reload]');
	await reply('figure:7d:1');
	await expect.poll(() => text('[data-figure]')).toBe('7d at 1');
}

test('CSR: a recipe reading a row value its parent forwards follows the row and its own state', async () => {
	await render(BoardPage);
	await reply('figure:7d:0');
	await expect.poll(() => text('[data-figure]')).toBe('7d at 0');
	await boardFollows();
});

test('SSR: a recipe reading a row value its parent forwards follows the row and its own state after resume', async () => {
	await renderSSR(BoardPage);
	expect(text('[data-figure]')).toBe('7d at 0');
	await boardFollows();
});

import WatchPage from './watch-page.tsrx';

const price = (symbol: string) => text(`[data-symbol="${symbol}"] [data-price]`);

async function watchlistFollows() {
	click('[data-reload]');
	await reply('quote:AAPL:1:0');
	await expect.poll(() => price('AAPL')).toBe('AAPL 1/0');
	click('[data-add]');
	await reply('quote:NVDA:1:0');
	await expect.poll(() => price('NVDA')).toBe('NVDA 1/0');
	click('[data-reload]');
	await reply('quote:AAPL:2:0');
	await reply('quote:NVDA:2:0');
	await expect.poll(() => [price('AAPL'), price('NVDA')]).toEqual(['AAPL 2/0', 'NVDA 2/0']);
	document.querySelector<HTMLElement>('[data-symbol="NVDA"] [data-again]')!.click();
	await reply('quote:NVDA:2:1');
	await expect.poll(() => price('NVDA')).toBe('NVDA 2/1');
	click('[data-restart]');
	await reply('quote:AAPL:0:0');
	await expect.poll(() => price('AAPL')).toBe('AAPL 0/0');
	expect(document.querySelectorAll('[data-symbol]')).toHaveLength(1);
	click('[data-reload]');
	await reply('quote:AAPL:1:0');
	await expect.poll(() => price('AAPL')).toBe('AAPL 1/0');
}

test('CSR: rows a recipe builds from a reload prop follow the card reload, served and added', async () => {
	await render(WatchPage);
	await reply('quote:AAPL:0:0');
	await expect.poll(() => price('AAPL')).toBe('AAPL 0/0');
	await watchlistFollows();
});

test('SSR: rows a recipe builds from a reload prop follow the card reload, served and added, after resume', async () => {
	await renderSSR(WatchPage);
	expect(price('AAPL')).toBe('AAPL 0/0');
	await watchlistFollows();
});
