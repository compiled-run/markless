import { afterEach, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { ChildCallsProp } from './child-calls-prop.tsrx';
import { EarlyReturn } from './early-return.tsrx';
import { FailingSave } from './failing-save.tsrx';
import { NestedWrappers } from './nested-wrappers.tsrx';
import { SubmitMark } from './submit-mark.tsrx';
import { SyncKeyInput } from './sync-key-input.tsrx';
import { TwoClicks } from './two-clicks.tsrx';
import { UnrelatedWrite } from './unrelated-write.tsrx';
import { WrapperEarlyReturn } from './wrapper-early-return.tsrx';
import { WrapperFailingSave } from './wrapper-failing-save.tsrx';
import { WrapperImported } from './wrapper-imported.tsrx';
import { WrapperSameFile } from './wrapper-same-file.tsrx';
import { WrapperSpread } from './wrapper-spread.tsrx';

// The compiler marks a visible async value busy from the moment a handler that writes one of its
// key's inputs starts, not from the write itself (goals/async-error-states/submit-quiet-design.md
// Q1 option 1). The mark stays unbroken until the refresh that write causes lands or fails, and
// clears with no refresh when the handler never reaches the write.
afterEach(() => cleanup());
afterEach(() => commands.throttleCpu(1));

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

// Reconstructs every `aria-busy` value a selector held, from the mutation that set it rather
// than a frame sample: a frame-rate poll can miss the whole window on a loaded main thread
// (goals/handoffs/async-w39.md), while every attribute mutation is still recorded even when the
// callback that reports it is delayed.
function sampleBusy(container: ParentNode, selector: string) {
	const target = container.querySelector(selector);
	if (!target) throw new Error(`Expected ${selector} in the rendered DOM.`);
	const priorValues: Array<string | null> = [];
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) priorValues.push(mutation.oldValue);
	});
	observer.observe(target, { attributes: true, attributeFilter: ['aria-busy'], attributeOldValue: true });
	return (): boolean[] => {
		for (const mutation of observer.takeRecords()) priorValues.push(mutation.oldValue);
		observer.disconnect();
		const isBusy = (value: string | null) => value === 'true';
		return [...priorValues.map(isBusy), isBusy(target.getAttribute('aria-busy'))];
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

// Throttled on purpose: the busy window here is short enough (one 25ms handler delay plus a
// 10ms recipe) that a loaded main thread is what exposed the dropped-sample flake this guards.
test('CSR: a key reached through a sync computed is still marked from the click', async () => {
	await commands.throttleCpu(6);
	await syncKeyInputScenario(await render(SyncKeyInput));
});

test('SSR: a key reached through a sync computed is still marked from the click', async () => {
	await commands.throttleCpu(6);
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

// The handler is authored on a component's prop rather than directly on the native element; the
// mark has to start at the click regardless of how many components forward it on the way down.
test('CSR: a handler forwarded through a same-file wrapper component is marked from the click', async () => {
	await submitMarkScenario(await render(WrapperSameFile));
});

test('SSR: a handler forwarded through a same-file wrapper component is marked from the click', async () => {
	await submitMarkScenario(await renderSSR(WrapperSameFile));
});

test('CSR: a handler forwarded through an imported wrapper component is marked from the click', async () => {
	await submitMarkScenario(await render(WrapperImported));
});

test('SSR: a handler forwarded through an imported wrapper component is marked from the click', async () => {
	await submitMarkScenario(await renderSSR(WrapperImported));
});

test('CSR: a handler reaching the native element only through a props spread is marked from the click', async () => {
	await submitMarkScenario(await render(WrapperSpread));
});

test('SSR: a handler reaching the native element only through a props spread is marked from the click', async () => {
	await submitMarkScenario(await renderSSR(WrapperSpread));
});

test('CSR: a handler a child calls from its own click handler is marked from the click', async () => {
	await submitMarkScenario(await render(ChildCallsProp));
});

test('SSR: a handler a child calls from its own click handler is marked from the click', async () => {
	await submitMarkScenario(await renderSSR(ChildCallsProp));
});

test('CSR: a handler forwarded through two nested wrapper components is marked from the click', async () => {
	await submitMarkScenario(await render(NestedWrappers));
});

test('SSR: a handler forwarded through two nested wrapper components is marked from the click', async () => {
	await submitMarkScenario(await renderSSR(NestedWrappers));
});

async function wrapperEarlyReturnScenario(screen: Screen) {
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

test('CSR: a forwarded handler that returns before writing clears the mark and refetches nothing', async () => {
	await wrapperEarlyReturnScenario(await render(WrapperEarlyReturn));
});

test('SSR: a forwarded handler that returns before writing clears the mark and refetches nothing', async () => {
	await wrapperEarlyReturnScenario(await renderSSR(WrapperEarlyReturn));
});

async function wrapperFailingSaveScenario(screen: Screen) {
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

test('CSR: a forwarded handler whose save fails clears the mark with no refresh', async () => {
	await wrapperFailingSaveScenario(await render(WrapperFailingSave));
});

test('SSR: a forwarded handler whose save fails clears the mark with no refresh', async () => {
	await wrapperFailingSaveScenario(await renderSSR(WrapperFailingSave));
});
