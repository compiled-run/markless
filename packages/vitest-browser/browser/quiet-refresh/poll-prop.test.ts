import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { PollThroughNestedProps } from './poll-nested-props.tsrx';
import { PollThroughProp } from './poll-prop.tsrx';

// The gap goals/handoffs/async-final3.md named: a callback prop a timer or socket message calls
// through a component, via the same capture-slot dispatch (`invokeSymbol`/`marklessInvokeCallbackSlot`)
// a click uses, must stay quiet; only a real DOM dispatch's own live extent — synchronous or
// through an awaited continuation — makes that same callback loud.
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

async function loudRefreshScenario(screen: Screen, button = '[data-refresh]') {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-orders]'), poll).toBe('100');

	const said = listen();
	click(container, button);
	await expect.poll(() => busy(container, '[data-orders]'), poll).toBe(true);
	expect(text(container, '[data-orders]'), 'the kept value stays while busy').toBe('100');
	await expect.poll(() => text(container, '[data-orders]'), poll).toBe('101');
	await expect.poll(() => busy(container, '[data-orders]'), poll).toBe(false);
	await expect.poll(() => document.querySelector(REGION)?.textContent, poll).toBe('Updated');
	expect(
		said(),
		'a click calling the forwarded callback prop directly is loud',
	).toEqual(['Updating…', 'Updated']);
}

test('CSR: the forwarded callback prop invoked by a click is marked busy and announced', async () => {
	await loudRefreshScenario(await render(PollThroughProp));
});

test('SSR: the forwarded callback prop invoked by a click is marked busy and announced', async () => {
	await loudRefreshScenario(await renderSSR(PollThroughProp));
});

async function quietTimerScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-orders]'), poll).toBe('100');

	const sawBusy = sampleBusy(container, '[data-orders]');
	const said = listen();
	click(container, '[data-start-poll]');
	await expect.poll(() => numberOf(container, '[data-orders]'), poll).toBeGreaterThanOrEqual(101);
	await wait(60);
	expect(sawBusy(), 'the same callback prop invoked by a timer never sets aria-busy').not.toContain(
		true,
	);
	expect(said(), 'the same callback prop invoked by a timer announces nothing').toEqual([]);
}

test('CSR: the same forwarded callback prop invoked by a timer stays quiet', async () => {
	await quietTimerScenario(await render(PollThroughProp));
});

test('SSR: the same forwarded callback prop invoked by a timer stays quiet', async () => {
	await quietTimerScenario(await renderSSR(PollThroughProp));
});

async function quietSocketScenario(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-orders]'), poll).toBe('100');
	const dispatch = () => window.dispatchEvent(new Event('mock-socket-message'));

	const sawBusy = sampleBusy(container, '[data-orders]');
	const said = listen();
	click(container, '[data-connect]');
	// The handler loads its compiled module asynchronously; wait for that one-off load before
	// dispatching once, same as quiet-refresh.test.ts's socket scenario.
	await wait(150);
	dispatch();
	await expect.poll(() => numberOf(container, '[data-orders]'), poll).toBeGreaterThanOrEqual(101);
	await wait(60);
	expect(sawBusy(), 'the same callback prop invoked by a socket message never sets aria-busy').not.toContain(
		true,
	);
	expect(said(), 'the same callback prop invoked by a socket message announces nothing').toEqual([]);
}

test('CSR: the same forwarded callback prop invoked by a socket message stays quiet', async () => {
	await quietSocketScenario(await render(PollThroughProp));
});

test('SSR: the same forwarded callback prop invoked by a socket message stays quiet', async () => {
	await quietSocketScenario(await renderSSR(PollThroughProp));
});

test('CSR: the forwarded callback prop called after the click handler\'s own await is loud', async () => {
	await loudRefreshScenario(await render(PollThroughProp), '[data-refresh-later]');
});

test('SSR: the forwarded callback prop called after the click handler\'s own await is loud', async () => {
	await loudRefreshScenario(await renderSSR(PollThroughProp), '[data-refresh-later]');
});

test('CSR: an awaiting callback prop forwarded through two components is loud on click', async () => {
	await loudRefreshScenario(await render(PollThroughNestedProps));
});

test('CSR: an awaiting callback prop forwarded through two components is loud after the click handler\'s own await', async () => {
	await loudRefreshScenario(await render(PollThroughNestedProps), '[data-refresh-later]');
});

test('CSR: an awaiting callback prop forwarded through two components stays quiet from a timer', async () => {
	await quietTimerScenario(await render(PollThroughNestedProps));
});

test('CSR: an awaiting callback prop forwarded through two components stays quiet from a socket message', async () => {
	await quietSocketScenario(await render(PollThroughNestedProps));
});

test('SSR: an awaiting callback prop forwarded through two components is loud on click', async () => {
	await loudRefreshScenario(await renderSSR(PollThroughNestedProps));
});

test('SSR: an awaiting callback prop forwarded through two components is loud after the click handler\'s own await', async () => {
	await loudRefreshScenario(await renderSSR(PollThroughNestedProps), '[data-refresh-later]');
});

test('SSR: an awaiting callback prop forwarded through two components stays quiet from a timer', async () => {
	await quietTimerScenario(await renderSSR(PollThroughNestedProps));
});

test('SSR: an awaiting callback prop forwarded through two components stays quiet from a socket message', async () => {
	await quietSocketScenario(await renderSSR(PollThroughNestedProps));
});
