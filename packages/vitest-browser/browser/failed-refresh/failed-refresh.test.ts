import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { App as Balance } from './balance.tsrx';
import { Profile } from './nested.tsrx';
import { Roster } from './roster.tsrx';
import { Statement } from './statement.tsrx';
import { ledger } from './statement-ledger.ts';
import FirstReject from '../refresh-hold/first-reject.tsrx';

// A refresh that fails keeps the shown content and renders the @catch arm right after it, in the same block.
afterEach(() => cleanup());
beforeEach(() => {
	ledger.down = new Set(['may']);
});

type Frame = { readonly kept: string | null; readonly failed: boolean; readonly pending: boolean };

function sample(container: HTMLElement, kept: string, failed: string) {
	const frames: Frame[] = [];
	let running = true;
	const tick = () => {
		if (!running) return;
		frames.push({
			kept: container.querySelector(kept)?.textContent ?? null,
			failed: !!container.querySelector(failed),
			pending: !!container.querySelector('[data-pending]'),
		});
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return () => {
		running = false;
		return frames;
	};
}

function click(container: HTMLElement, selector: string) {
	const target = container.querySelector<HTMLElement>(selector);
	if (!target) throw new Error(`Expected ${selector} in the rendered DOM.`);
	target.click();
}

const follows = (first: Element, second: Element) =>
	!!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

type Screen = { readonly container: unknown };

async function keepsBalance(screen: Screen) {
		const container = screen.container as HTMLElement;
		await expect.poll(() => container.querySelector('[data-amount]')?.textContent, { timeout: 5_000 }).toBe('10');
		const stop = sample(container, '[data-amount]', '[data-failed]');
		click(container, '[data-close]');
		await expect.poll(() => container.querySelector('[data-failed]')?.textContent, { timeout: 5_000 }).toBe('Account closed');
		const frames = stop();

		const boundary = container.querySelector('[data-boundary]')!;
		const amount = boundary.querySelector('[data-amount]');
		const failed = boundary.querySelector('[data-failed]')!;
		expect(amount?.textContent).toBe('10');
		expect(follows(amount!, failed)).toBe(true);
		expect(frames.every((frame) => frame.kept === '10'), 'the kept content left the screen').toBe(true);
		expect(frames.some((frame) => frame.pending)).toBe(false);
		expect(container.querySelectorAll('[aria-busy]')).toHaveLength(0);

		click(container, '[data-reopen]');
		await expect.poll(() => container.querySelector('[data-amount]')?.textContent, { timeout: 5_000 }).toBe('30');
		expect(container.querySelector('[data-failed]')).toBeNull();
		expect(container.querySelectorAll('[aria-busy]')).toHaveLength(0);
}

test('client-rendered: a failed refresh keeps the content, shows @catch after it, and a recovery removes it', async () => {
	await keepsBalance(await render(Balance));
});

test('server-rendered: a failed refresh keeps the content, shows @catch after it, and a recovery removes it', async () => {
	await keepsBalance(await renderSSR(Balance));
});

test('a failed refresh of a list in a table keeps its rows and adds the @catch row after them', async () => {
	const screen = await renderSSR(Roster);
	const container = screen.container as HTMLElement;
	const names = () => [...container.querySelectorAll('[data-member]')].map((row) => row.textContent).join(',');
	await expect.poll(names, { timeout: 5_000 }).toBe('Member 11,Member 12');
	click(container, '[data-second]');
	await expect.poll(() => container.querySelector('[data-problem]')?.textContent, { timeout: 5_000 }).toBe('Page 2 is unavailable');
	expect(names()).toBe('Member 11,Member 12');
	const rows = [...container.querySelectorAll('tbody > tr')].map((row) => (row.hasAttribute('data-problem') ? 'problem' : 'member'));
	expect(rows).toEqual(['member', 'member', 'problem']);

	click(container, '[data-third]');
	await expect.poll(names, { timeout: 5_000 }).toBe('Member 31,Member 32');
	expect(container.querySelector('[data-problem]')).toBeNull();
});

async function onlyCatch(screen: Screen) {
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-failed]')?.textContent, { timeout: 3_000 }).toBe('Account closed');
	expect(container.querySelector('[data-amount]')).toBeNull();
	expect(container.querySelector('[data-pending]')).toBeNull();
}

test('client-rendered: a first-load failure still shows only the @catch arm', async () => {
	await onlyCatch(await render(FirstReject));
});

test('server-rendered: a first-load failure still shows only the @catch arm', async () => {
	await onlyCatch(await renderSSR(FirstReject));
});

test('a nested block that fails on refresh handles it itself; the outer block and its @catch are untouched', async () => {
	const screen = await render(Profile);
	const container = screen.container as HTMLElement;
	const titles = () => [...container.querySelectorAll('li')].map((item) => item.textContent).join(',');
	await expect.poll(titles, { timeout: 5_000 }).toBe('Alpha,Beta');
	await expect.poll(() => container.querySelector('[data-author]')?.textContent, { timeout: 5_000 }).toBe('Rin');
	click(container, '[data-top]');
	await expect.poll(() => container.querySelector('[data-feed-error]')?.textContent, { timeout: 5_000 }).toBe('Ranking unavailable');
	expect(titles()).toBe('Alpha,Beta');
	expect(follows(container.querySelector('ol')!, container.querySelector('[data-feed-error]')!)).toBe(true);
	expect(container.querySelector('[data-feed] [data-feed-error]')).not.toBeNull();
	expect(container.querySelector('[data-profile-error]')).toBeNull();
	expect(container.querySelector('[data-author]')?.textContent).toBe('Rin');

	click(container, '[data-old]');
	await expect.poll(titles, { timeout: 5_000 }).toBe('Gamma');
	expect(container.querySelector('[data-feed-error]')).toBeNull();
	expect(container.querySelector('[data-profile-error]')).toBeNull();
});

async function retries(screen: Screen) {
		const container = screen.container as HTMLElement;
		await expect.poll(() => container.querySelector('[data-problem]')?.textContent, { timeout: 5_000 }).toBe('Ledger offline for may');
		expect(container.querySelector('[data-title]')).toBeNull();

		ledger.down.clear();
		click(container, '[data-retry]');
		await expect.poll(() => container.querySelector('[data-title]')?.textContent, { timeout: 5_000 }).toBe('Statement for may');
		expect(container.querySelector('[data-problem]')).toBeNull();

		ledger.down.add('june');
		click(container, '[data-june]');
		await expect.poll(() => container.querySelector('[data-problem]')?.textContent, { timeout: 5_000 }).toBe('Ledger offline for june');
		expect(container.querySelector('[data-title]')?.textContent).toBe('Statement for may');

		ledger.down.clear();
		click(container, '[data-retry]');
		await expect.poll(() => container.querySelector('[data-title]')?.textContent, { timeout: 5_000 }).toBe('Statement for june');
		expect(container.querySelector('[data-problem]')).toBeNull();
		expect(container.querySelector('[data-retry]')).toBeNull();
	}

test('client-rendered: @catch (error, reset) retries a first-load failure and then a failed refresh', async () => {
	await retries(await render(Statement));
});

test('server-rendered: @catch (error, reset) retries a first-load failure and then a failed refresh', async () => {
	await retries(await renderSSR(Statement));
});
