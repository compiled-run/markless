import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { EarlyReturn } from './early-return.tsrx';
import { FailingSave } from './failing-save.tsrx';
import { SubmitMark } from './submit-mark.tsrx';
import { SyncKeyInput } from './sync-key-input.tsrx';
import { TwoClicks } from './two-clicks.tsrx';
import { UnrelatedWrite } from './unrelated-write.tsrx';

// The compiler marks a visible async value busy from the moment a handler that writes one of its
// key's inputs starts, not from the write itself (goals/async-error-states/submit-quiet-design.md
// Q1 option 1). The mark stays unbroken until the refresh that write causes lands or fails, and
// clears with no refresh when the handler never reaches the write.
afterEach(() => cleanup());

const poll = { timeout: 5_000, interval: 5 };

type Screen = { readonly container: unknown; readonly runtime?: { readonly runtime?: unknown } };

async function mounted(screen: Screen): Promise<HTMLElement> {
	await (
		screen.runtime?.runtime as { whenAsyncBoundariesSettled?: () => Promise<void> } | undefined
	)?.whenAsyncBoundariesSettled?.();
	return screen.container as HTMLElement;
}

const text = (container: ParentNode, selector: string) =>
	container.querySelector(selector)?.textContent ?? null;

const busy = (container: ParentNode, selector: string): boolean =>
	container.querySelector(selector)?.getAttribute('aria-busy') === 'true';

function click(container: ParentNode, selector: string): void {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector} in the rendered DOM.`);
	button.click();
}

// Samples a selector's busy state every frame, so a drop between two marked moments is caught
// even though `expect.poll` alone would only ever see the two ends.
function sampleBusy(container: ParentNode, selector: string) {
	const seen: boolean[] = [];
	let running = true;
	const tick = () => {
		if (!running) return;
		seen.push(busy(container, selector));
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return () => {
		running = false;
		return seen;
	};
}

function assertNoGap(samples: ReadonlyArray<boolean>): void {
	const first = samples.indexOf(true);
	const last = samples.lastIndexOf(true);
	expect(first, 'expected the mark to appear at least once').toBeGreaterThanOrEqual(0);
	expect(
		samples.slice(first, last + 1).every(Boolean),
		'the mark dropped between the click and the refresh landing',
	).toBe(true);
}

async function submitMarkScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-balance]'), poll).toBe('100');

	const stop = sampleBusy(container, '[data-balance]');
	click(container, '[data-save]');
	// Marked before the 40ms save settles: the value on screen has not moved yet.
	await expect.poll(() => busy(container, '[data-balance]'), poll).toBe(true);
	expect(text(container, '[data-balance]')).toBe('100');
	await expect.poll(() => text(container, '[data-balance]'), poll).toBe('101');
	await expect.poll(() => busy(container, '[data-balance]'), poll).toBe(false);
	assertNoGap(stop());
}

test('CSR: a save marks the balance from the click, through the POST, until the refresh lands', async () => {
	await submitMarkScenario(await render(SubmitMark));
});

test('SSR: a save marks the balance from the click, through the POST, until the refresh lands', async () => {
	await submitMarkScenario(await renderSSR(SubmitMark));
});

async function earlyReturnScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-total]'), poll).toBe('10');

	click(container, '[data-toggle]'); // ok = false
	click(container, '[data-save]');
	await expect.poll(() => busy(container, '[data-total]'), poll).toBe(true);
	expect(text(container, '[data-total]')).toBe('10');
	await expect.poll(() => busy(container, '[data-total]'), poll).toBe(false);
	expect(text(container, '[data-total]')).toBe('10');

	// The write path still works once the handler actually reaches it.
	click(container, '[data-toggle]'); // ok = true
	click(container, '[data-save]');
	await expect.poll(() => busy(container, '[data-total]'), poll).toBe(true);
	await expect.poll(() => text(container, '[data-total]'), poll).toBe('11');
	await expect.poll(() => busy(container, '[data-total]'), poll).toBe(false);
}

test('CSR: a handler that returns before writing clears the mark and refetches nothing', async () => {
	await earlyReturnScenario(await render(EarlyReturn));
});

test('SSR: a handler that returns before writing clears the mark and refetches nothing', async () => {
	await earlyReturnScenario(await renderSSR(EarlyReturn));
});

async function failingSaveScenario(screen: Screen) {
	const reasons: unknown[] = [];
	const onRejection = (event: PromiseRejectionEvent) => {
		reasons.push(event.reason);
		event.preventDefault();
	};
	const onError = (event: ErrorEvent) => {
		reasons.push(event.error);
		event.preventDefault();
	};
	window.addEventListener('unhandledrejection', onRejection);
	window.addEventListener('error', onError);
	try {
		const container = await mounted(screen);
		await expect.poll(() => text(container, '[data-total]'), poll).toBe('20');

		click(container, '[data-save]');
		await expect.poll(() => busy(container, '[data-total]'), poll).toBe(true);
		await expect.poll(() => reasons.length, poll).toBeGreaterThan(0);
		await expect.poll(() => busy(container, '[data-total]'), poll).toBe(false);
		expect(text(container, '[data-total]')).toBe('20');
		expect(container.querySelector('[data-failed]')).toBeNull();
	} finally {
		window.removeEventListener('unhandledrejection', onRejection);
		window.removeEventListener('error', onError);
	}
}

test('CSR: a failing save clears the mark with no refresh', async () => {
	await failingSaveScenario(await render(FailingSave));
});

test('SSR: a failing save clears the mark with no refresh', async () => {
	await failingSaveScenario(await renderSSR(FailingSave));
});

async function unrelatedWriteScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-total]'), poll).toBe('30');

	const stop = sampleBusy(container, '[data-total]');
	click(container, '[data-note]');
	await expect.poll(() => text(container, '[data-note-text]'), poll).toBe('noted');
	expect(stop().some(Boolean), 'the unrelated write marked the value').toBe(false);
}

test('CSR: a handler writing an unrelated state never marks the value', async () => {
	await unrelatedWriteScenario(await render(UnrelatedWrite));
});

test('SSR: a handler writing an unrelated state never marks the value', async () => {
	await unrelatedWriteScenario(await renderSSR(UnrelatedWrite));
});

async function syncKeyInputScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-rows]'), poll).toBe('rows-p1');

	const stop = sampleBusy(container, '[data-rows]');
	click(container, '[data-next]');
	await expect.poll(() => busy(container, '[data-rows]'), poll).toBe(true);
	expect(text(container, '[data-rows]')).toBe('rows-p1');
	await expect.poll(() => text(container, '[data-rows]'), poll).toBe('rows-p2');
	await expect.poll(() => busy(container, '[data-rows]'), poll).toBe(false);
	assertNoGap(stop());
}

test('CSR: a key reached through a sync computed is still marked from the click', async () => {
	await syncKeyInputScenario(await render(SyncKeyInput));
});

test('SSR: a key reached through a sync computed is still marked from the click', async () => {
	await syncKeyInputScenario(await renderSSR(SyncKeyInput));
});

async function twoClicksScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-total]'), poll).toBe('40');

	const stop = sampleBusy(container, '[data-total]');
	click(container, '[data-save]');
	await new Promise((resolve) => setTimeout(resolve, 5));
	click(container, '[data-save]');
	await expect.poll(() => text(container, '[data-total]'), poll).toBe('42');
	await expect.poll(() => busy(container, '[data-total]'), poll).toBe(false);
	assertNoGap(stop());
}

test('CSR: two clicks during the same wait both land, and the mark never drops between them', async () => {
	await twoClicksScenario(await render(TwoClicks));
});

test('SSR: two clicks during the same wait both land, and the mark never drops between them', async () => {
	await twoClicksScenario(await renderSSR(TwoClicks));
});
