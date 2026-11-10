import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { AwaitedHandler } from './awaited-handler.tsrx';
import { FailingPoll } from './failing-poll.tsrx';
import { PollAndButton } from './poll-and-button.tsrx';
import { Socket } from './socket.tsrx';

// A refresh caused outside an event handler is quiet (no busy mark, no announcement) but still updates, and fails with @catch after kept content.
afterEach(() => cleanup());

const poll = { timeout: 5_000, interval: 5 };
const REGION = '[data-markless-announcer]';

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

// Samples busy state every frame, so a one-frame flicker is caught too.
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

// Every text the announcer region holds, in order, from the moment the test starts listening.
function listen() {
	const said: string[] = [];
	let last = document.querySelector(REGION)?.textContent ?? '';
	const observer = new MutationObserver(() => {
		const current = document.querySelector(REGION)?.textContent ?? '';
		if (current !== last && current !== '') said.push(current);
		last = current;
	});
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	return () => {
		observer.disconnect();
		return said;
	};
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const numberOf = (container: ParentNode, selector: string) => Number(text(container, selector));

async function quietPollScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-orders]'), poll).toBe('100');

	const sawBusy = sampleBusy(container, '[data-orders]');
	const said = listen();
	click(container, '[data-start-poll]');
	// A tick lands with no busy mark and no announcement, ever.
	await expect.poll(() => numberOf(container, '[data-orders]'), poll).toBeGreaterThanOrEqual(101);
	await wait(60);
	expect(sawBusy(), 'a quiet poll never sets aria-busy').not.toContain(true);
	expect(said(), 'a quiet poll announces nothing').toEqual([]);
}

test('CSR: a background poll refreshes the value with no busy mark and no announcement', async () => {
	await quietPollScenario(await render(PollAndButton));
});

test('SSR: a background poll refreshes the value with no busy mark and no announcement', async () => {
	await quietPollScenario(await renderSSR(PollAndButton));
});

async function loudClickScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-orders]'), poll).toBe('100');

	const said = listen();
	click(container, '[data-refresh]');
	await expect.poll(() => busy(container, '[data-orders]'), poll).toBe(true);
	expect(text(container, '[data-orders]'), 'the kept value stays while busy').toBe('100');
	await expect.poll(() => text(container, '[data-orders]'), poll).toBe('101');
	await expect.poll(() => busy(container, '[data-orders]'), poll).toBe(false);
	await expect.poll(() => document.querySelector(REGION)?.textContent, poll).toBe('Updated');
	expect(said(), 'the same value refreshed by a click announces Updating then Updated').toEqual([
		'Updating…',
		'Updated',
	]);
}

test('CSR: the same value refreshed by a click is marked busy and announced', async () => {
	await loudClickScenario(await render(PollAndButton));
});

test('SSR: the same value refreshed by a click is marked busy and announced', async () => {
	await loudClickScenario(await renderSSR(PollAndButton));
});

async function socketScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-feed]'), poll).toBe('live-0');
	const dispatch = () => window.dispatchEvent(new Event('mock-socket-message'));

	const sawBusy = sampleBusy(container, '[data-feed]');
	const said = listen();
	click(container, '[data-connect]');
	// Wait for the handler's one-off module load, then dispatch once: re-dispatching would restart the fetch forever.
	await wait(150);
	dispatch();
	await expect.poll(() => text(container, '[data-feed]'), poll).toBe('live-1');
	dispatch();
	await expect.poll(() => text(container, '[data-feed]'), poll).toBe('live-2');
	await wait(60);
	expect(sawBusy(), 'a socket-driven refresh never sets aria-busy').not.toContain(true);
	expect(said(), 'a socket-driven refresh announces nothing').toEqual([]);
}

test('CSR: a socket-style message callback refreshes the value quietly', async () => {
	await socketScenario(await render(Socket));
});

test('SSR: a socket-style message callback refreshes the value quietly', async () => {
	await socketScenario(await renderSSR(Socket));
});

async function awaitedHandlerScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-total]'), poll).toBe('100');

	const said = listen();
	click(container, '[data-save]');
	// The write comes after the handler's 20ms `await`, so the mark starts then, still loud inside the click's turn.
	await expect.poll(() => busy(container, '[data-total]'), poll).toBe(true);
	expect(text(container, '[data-total]')).toBe('100');
	await expect.poll(() => text(container, '[data-total]'), poll).toBe('101');
	await expect.poll(() => busy(container, '[data-total]'), poll).toBe(false);
	await expect.poll(() => document.querySelector(REGION)?.textContent, poll).toBe('Updated');
	expect(said(), 'a write after an await is still loud').toEqual(['Updating…', 'Updated']);
}

test('CSR: a write a handler makes after its own await is still loud', async () => {
	await awaitedHandlerScenario(await render(AwaitedHandler));
});

test('SSR: a write a handler makes after its own await is still loud', async () => {
	await awaitedHandlerScenario(await renderSSR(AwaitedHandler));
});

async function failingPollScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-orders]'), poll).toBe('100');

	const sawBusy = sampleBusy(container, '[data-orders]');
	const said = listen();
	click(container, '[data-start-poll]');
	// poll 1 fails: the kept content ("100") stays, and @catch opens right after it.
	await expect.poll(() => text(container, '[data-failed]'), poll).toBe('Failed');
	expect(text(container, '[data-orders]'), 'the last good content is kept, not cleared').toBe('100');
	// A later poll recovers.
	await expect.poll(() => numberOf(container, '[data-orders]'), poll).toBeGreaterThanOrEqual(102);
	await wait(60);
	expect(sawBusy(), 'a quiet poll never sets aria-busy, even when it fails').not.toContain(true);
	// A quiet refresh's failure is always announced, though nothing was said while pending.
	await expect.poll(() => document.querySelector(REGION)?.textContent, poll).toBe('Update failed');
	expect(said(), 'the failure is announced on its own').toEqual(['Update failed']);
}

test('CSR: a quiet poll that fails keeps the content, opens @catch after it, and still announces', async () => {
	await failingPollScenario(await render(FailingPoll));
});

test('SSR: a quiet poll that fails keeps the content, opens @catch after it, and still announces', async () => {
	await failingPollScenario(await renderSSR(FailingPoll));
});
