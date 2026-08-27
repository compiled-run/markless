import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, beforeAll, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { parkPointerBeforeMount, watchForThrows } from '../demand-load-replay/counting.ts';
import ClientPressPage from './client-press-page.tsrx';
import ColdPressPage from './cold-press-page.tsrx';
import HoldPressPage from './hold-press-page.tsrx';
import HoverPressPage from './hover-press-page.tsrx';
import WarmupPage from './warmup-page.tsrx';

// A person's FIRST press on a step button of a served page is the gesture the
// focus-primed preload never covered: `click`/`pointerdown` are not key events,
// and Safari does not focus a button on click. These rows measure how much of
// that press the demand load costs, and that a hold begun on a cold page still
// starts its repeat.
//
// Each witness owns its fixture module: a page an earlier row rendered is
// already in the browser's module cache and reads warm.

const COLD_POLL = { timeout: 5000 };

// Every row measures a page whose own handler symbols are cold while the resume
// runtime is not, which is what "cold" means under the project's normal load.
beforeAll(async () => {
	await parkPointerBeforeMount();
	await renderSSR(WarmupPage);
	await userEvent.click(page.getByTestId('warmup-step'));
	// expect.poll is a test-only API, so this waits by hand.
	for (let waited = 0; waited < 5000 && numberOf('warmup-value') === 0; waited += 25)
		await sleep(25);
	await cleanup();
});

afterEach(async () => {
	await cleanup();
});

function el(testid: string): HTMLElement {
	return page.getByTestId(testid).element() as HTMLElement;
}

function numberOf(testid: string): number {
	return Number(el(testid).textContent);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * When the real press landed. A capture listener on the window runs at the
 * gesture itself, so this reads the press without the driver's own round trip
 * in it - which is the number the handler's timestamp has to be compared with.
 */
function pressMarks(): { readonly at: number[]; readonly stop: () => void } {
	const at: number[] = [];
	const listener = () => void at.push(performance.now());
	window.addEventListener('pointerdown', listener, true);
	return { at, stop: () => window.removeEventListener('pointerdown', listener, true) };
}

function report(label: string, ms: number): void {
	console.log(`cold-trigger-press: ${label} = ${ms.toFixed(1)}ms`);
}

test('SSR cold first click: the first press increments, and the gap it paid is reported', async () => {
	const thrown = watchForThrows();
	const marks = pressMarks();
	try {
		await parkPointerBeforeMount();
		await renderSSR(ColdPressPage);

		await userEvent.click(page.getByTestId('step'));
		await expect.poll(() => numberOf('value'), COLD_POLL).toBe(1);

		const press = marks.at[0];
		expect(press).toBeGreaterThan(0);
		report('SSR cold press to increment', numberOf('click-at') - press!);

		// The second press is warm: the module the first press paid for is in the
		// browser, so this one is answered without another fetch.
		const before = marks.at.length;
		await userEvent.click(page.getByTestId('step'));
		await expect.poll(() => numberOf('value')).toBe(2);
		report('SSR warm press to increment', numberOf('click-at') - marks.at[before]!);

		expect(thrown.seen).toEqual([]);
	} finally {
		marks.stop();
		thrown.stop();
	}
});

test('SSR: a hover that dwells before the press pays the gap the press would have', async () => {
	const thrown = watchForThrows();
	const marks = pressMarks();
	try {
		await parkPointerBeforeMount();
		await renderSSR(HoverPressPage);

		// A pointer reaches a button before it presses it. 120ms is the low end of
		// a real dwell on a desktop pointer.
		await userEvent.hover(page.getByTestId('step'));
		await sleep(120);

		await userEvent.click(page.getByTestId('step'));
		await expect.poll(() => numberOf('value'), COLD_POLL).toBe(1);

		const press = marks.at[0];
		expect(press).toBeGreaterThan(0);
		report('SSR hovered press to increment', numberOf('click-at') - press!);

		expect(thrown.seen).toEqual([]);
	} finally {
		marks.stop();
		thrown.stop();
	}
});

// Also the touch shape: a tap sends its crossing in the same task as the press,
// so nothing is primed and the press is answered off the queue, as it was before
// any preload existed.
test('SSR cold press-and-hold: a 600ms hold begun on a cold page repeats, and stops on release', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await renderSSR(HoldPressPage);

		const step = el('step');
		const pressedAt = performance.now();
		step.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		try {
			await sleep(600);
		} finally {
			step.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
		}

		await expect.poll(() => numberOf('repeats'), COLD_POLL).toBeGreaterThan(0);
		report('SSR cold press to repeat timer start', numberOf('down-at') - pressedAt);
		console.log(`cold-trigger-press: repeats in a 600ms cold hold = ${numberOf('repeats')}`);

		// The release ends the hold rather than leaving it spinning.
		const held = numberOf('repeats');
		await sleep(300);
		expect(numberOf('repeats')).toBe(held);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('CSR: the press increments and a hover onto the button dispatched nothing', async () => {
	const thrown = watchForThrows();
	const marks = pressMarks();
	try {
		await parkPointerBeforeMount();
		await render(ClientPressPage);

		await userEvent.hover(page.getByTestId('step'));
		await sleep(120);
		// Priming is a fetch, never a dispatch.
		expect(numberOf('value')).toBe(0);
		expect(numberOf('down-at')).toBe(0);

		await userEvent.click(page.getByTestId('step'));
		await expect.poll(() => numberOf('value')).toBe(1);
		expect(marks.at.length).toBeGreaterThan(0);
		report('CSR hovered press to increment', numberOf('click-at') - marks.at[0]!);

		expect(thrown.seen).toEqual([]);
	} finally {
		marks.stop();
		thrown.stop();
	}
});
