import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Board from './crr-board.tsrx';
import Page from './crr-page.tsrx';
import Projection from './crr-projection.tsrx';

afterEach(cleanup);

const go = (label: string) => document.querySelector<HTMLButtonElement>(`[data-go="${label}"]`)!;
const seen = (label: string) => document.querySelector<HTMLElement>(`[data-seen="${label}"]`)!;
const picked = () => document.querySelector('[data-picked]')!.textContent;

// A message posted from a mutation is read only after every microtask of that
// task has drained, so a page caught half-written here would paint half-written.
function watchTaskEnds(describe: () => string | undefined) {
	const torn: string[] = [];
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		const tear = describe();
		if (tear) torn.push(tear);
	};
	const observer = new MutationObserver(() => channel.port2.postMessage(null));
	observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
	return {
		torn,
		stop() {
			observer.disconnect();
			channel.port1.close();
		},
	};
}

// The rows are keyed by id and never reorder: only the derived fields move, so a
// row that stays as it was served shows the stale item.
async function pinRowsFollowTheirItems() {
	const watch = watchTaskEnds(() => {
		const text = picked();
		if (go('last')?.disabled !== (text === 'none')) return `last locked=${go('last')?.disabled} picked=${text}`;
		if (seen('last')?.hidden !== (text !== 'last')) return `last seen=${!seen('last')?.hidden} picked=${text}`;
	});
	expect(go('last').disabled).toBe(true);
	expect(seen('ben').hidden).toBe(true);

	await userEvent.click(go('ben'));
	await expect.poll(() => go('last').disabled).toBe(false);
	expect(picked()).toBe('ben');
	expect(seen('ben').hidden).toBe(false);
	expect(seen('ada').hidden).toBe(false);
	expect(
		Array.from(document.querySelectorAll('[data-entry]')).map((row) => row.getAttribute('data-entry')),
	).toEqual(['ada', 'ben', 'last']);
	// The rebuilt row keeps the focus its old row held.
	expect(document.activeElement).toBe(go('ben'));

	// A rebuilt row dispatches its own handler, and rebuilds again.
	await userEvent.click(go('last'));
	await expect.poll(() => picked()).toBe('last');
	await expect.poll(() => seen('last').hidden).toBe(false);
	expect(document.querySelectorAll('[data-entry]')).toHaveLength(3);
	watch.stop();
	expect(watch.torn).toEqual([]);
}

test('CSR: a component row re-renders when its item changes under the same key', async () => {
	await render(Page);
	await pinRowsFollowTheirItems();
});

test('SSR: a component row re-renders when its item changes under the same key', async () => {
	await renderSSR(Page);
	await pinRowsFollowTheirItems();
});

const choose = (code: string) => document.querySelector<HTMLButtonElement>(`[data-choose="${code}"]`)!;
const mark = (code: string) => document.querySelector<HTMLElement>(`[data-mark="${code}"]`)!;
const chosen = () => document.querySelector('[data-chosen]')!.textContent;
const tally = () => document.querySelector('[data-count]')!.textContent;

async function pinBoardWritesLandTogether() {
	const watch = watchTaskEnds(() => {
		const shown = [chosen(), tally(), choose('k4')?.disabled, mark('k2')?.hidden, mark('k4')?.hidden];
		const agreeing = [
			['-', '0', true, true, true],
			['k2', '1', false, false, true],
			['k4', '2', false, false, false],
		];
		if (!agreeing.some((state) => state.every((value, at) => value === shown[at])))
			return JSON.stringify(shown);
	});
	expect(choose('k4').disabled).toBe(true);

	await userEvent.click(choose('k2'));
	await expect.poll(() => choose('k4').disabled).toBe(false);
	expect([chosen(), tally(), mark('k2').hidden]).toEqual(['k2', '1', false]);

	await userEvent.click(choose('k4'));
	await expect.poll(() => mark('k4').hidden).toBe(false);
	expect([chosen(), tally()]).toEqual(['k4', '2']);
	expect(document.querySelectorAll('[data-tile]')).toHaveLength(4);
	watch.stop();
	expect(watch.torn).toEqual([]);
}

test('CSR: one handler writing rows and text lands them in one task', async () => {
	await render(Board);
	await pinBoardWritesLandTogether();
});

test('SSR: one handler writing rows and text lands them in one task', async () => {
	await renderSSR(Board);
	await pinBoardWritesLandTogether();
});

const count = (label: string) => document.querySelector(`[data-count="${label}"]`)!.textContent;
const stamp = (label: string) => document.querySelector<HTMLElement>(`[data-stamp="${label}"]`)!;
const cardGo = (label: string) => document.querySelector<HTMLButtonElement>(`[data-card-go="${label}"]`)!;
const clicks = () => document.querySelector('[data-clicks]')!.textContent;

async function pinProjectedElementsFollowTheirRow() {
	expect(['ada', 'ben', 'last'].map(count)).toEqual(['1 opened', '1 opened', '1 opened']);
	expect(cardGo('last').disabled).toBe(true);

	document.querySelector<HTMLElement>('[data-open-ben]')!.click();
	// Every row's projected element reads the page state, not only the last row's.
	await expect.poll(() => ['ada', 'ben', 'last'].map(count)).toEqual(['2 opened', '2 opened', '2 opened']);
	await expect.poll(() => cardGo('last').disabled).toBe(false);
	expect(stamp('ben').hidden).toBe(false);
	expect(stamp('last').hidden).toBe(true);

	for (const label of ['ada', 'ben', 'last'])
		document.querySelector<HTMLElement>(`[data-tap="${label}"]`)!.click();
	await expect.poll(() => clicks()).toBe('3');
	document.querySelector<HTMLElement>('[data-open-ben]')!.click();
	await expect.poll(() => ['ada', 'ben', 'last'].map(count)).toEqual(['3 opened', '3 opened', '3 opened']);
}

test('CSR: elements a row projects into its component follow their own row', async () => {
	await render(Projection);
	await pinProjectedElementsFollowTheirRow();
});

test('SSR: elements a row projects into its component follow their own row', async () => {
	await renderSSR(Projection);
	await pinProjectedElementsFollowTheirRow();
});
