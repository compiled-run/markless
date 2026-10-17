import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import BareShelves from './tnro-bare.tsrx';
import WrappedShelves from './tnro-wrapped.tsrx';

// The test opens the gate the shelves' async value waits on, so each case pins one
// order of settle against runtime start instead of hoping a cold load lands in it.

afterEach(() => {
	cleanup();
	delete (globalThis as { __shelfGate?: Promise<void> }).__shelfGate;
});

function gate(): () => void {
	let open!: () => void;
	(globalThis as { __shelfGate?: Promise<void> }).__shelfGate = new Promise<void>(
		(resolve) => (open = resolve),
	);
	return open;
}

const books = () => [...document.querySelectorAll('[data-book]')].map((node) => node.textContent);
const shelves = () =>
	[...document.querySelectorAll('[data-shelf]')].map((node) => node.getAttribute('data-shelf'));

async function pinOnce() {
	await expect.poll(books).toEqual(['b1', 'b2', 'b3']);
	await expect.poll(() => document.querySelector('[data-shelves-pending]')).toBeNull();
	// Rows minted late would land after the settle; give every queued write a turn.
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(shelves()).toEqual(['s1', 's2']);
	expect(books()).toEqual(['b1', 'b2', 'b3']);
	const last = document.querySelector('[data-shelf="s2"]')!;
	expect(
		document.querySelector('footer')!.compareDocumentPosition(last) &
			Node.DOCUMENT_POSITION_PRECEDING,
	).toBeTruthy();
}

for (const [name, Shelves] of [
	['written straight into the arm', BareShelves],
	['inside an element of the arm', WrappedShelves],
] as const) {
	test(`CSR: nested rows ${name} render once when the value settles before mount`, async () => {
		gate()();
		await render(Shelves);
		await pinOnce();
	});

	test(`CSR: nested rows ${name} render once when the value settles during mount`, async () => {
		const open = gate();
		const mounted = render(Shelves);
		queueMicrotask(open);
		await mounted;
		await pinOnce();
	});

	test(`CSR: nested rows ${name} render once when the value settles after the runtime started`, async () => {
		const open = gate();
		const screen = await render(Shelves);
		await screen.runtime.runtime.start();
		open();
		await pinOnce();
	});
}

test('CSR: rows written straight into the arm stay with the arm while the value re-runs', async () => {
	gate()();
	await render(BareShelves);
	await pinOnce();
	const open = gate();
	document.querySelector<HTMLElement>('[data-next-round]')!.click();
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(books()).toEqual(['b1', 'b2', 'b3']);
	open();
	await expect.poll(books).toEqual(['b1', 'b2', 'b4']);
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(shelves()).toEqual(['s1', 's2']);
	expect(books()).toEqual(['b1', 'b2', 'b4']);
});

test('SSR: nested rows written straight into the arm render once', async () => {
	await renderSSR(BareShelves);
	await pinOnce();
});

test('SSR: nested rows inside an element of the arm render once', async () => {
	await renderSSR(WrappedShelves);
	await pinOnce();
});
