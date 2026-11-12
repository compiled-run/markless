import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderServerHTML, renderStream } from '../src/index.ts';
import { Page } from './async-catch-text/page.tsrx';
import { SlowPage } from './async-catch-text/slow-page.tsrx';
import { Rows } from './async-catch-text/rows.tsrx';
import { SlowRows } from './async-catch-text/slow-rows.tsrx';
import { release, resetService, service } from './async-catch-text/service.ts';

// Text in a @catch that mixes the error with page state updates each read in place: the element and its text node stay.
afterEach(() => cleanup());
beforeEach(() => resetService([['first', 'Service down.']]));

const WAIT = { timeout: 5_000, interval: 10 };
const textOf = (selector: string) =>
	document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const click = (selector: string) => {
	const target = document.querySelector<HTMLElement>(selector);
	if (!target) throw new Error(`Expected ${selector} in the rendered DOM.`);
	target.click();
};

/** Presses `button` and checks `selector` now reads `expected` from the same element, beside the same sibling, as one text node. */
async function updatesInPlace(selector: string, button: string, expected: string) {
	const host = document.querySelector(selector)!;
	const sibling = host.nextElementSibling;
	expect(host.childNodes.length).toBe(1);
	click(button);
	await expect.poll(() => textOf(selector), WAIT).toBe(expected);
	expect(document.querySelector(selector)).toBe(host);
	expect(host.nextElementSibling).toBe(sibling);
	expect(host.childNodes.length).toBe(1);
}

async function firstFailure() {
	await expect.poll(() => textOf('[data-error]'), WAIT).toBe('Service down. (attempt 1)');
	await updatesInPlace('[data-error]', '[data-next]', 'Service down. (attempt 2)');
	await updatesInPlace('[data-error]', '[data-next]', 'Service down. (attempt 3)');
}

async function retryPendingKeepsTheShownError() {
	await firstFailure();
	service.held = true;
	click('[data-again]');
	await expect.poll(() => service.waiting.length, WAIT).toBe(1);
	// The @catch stays on screen while the retry runs; its text keeps the error it shows.
	expect(textOf('[data-error]')).toBe('Service down. (attempt 3)');
	await updatesInPlace('[data-error]', '[data-next]', 'Service down. (attempt 4)');
	service.down.set('first', 'Still down.');
	release();
	await expect.poll(() => textOf('[data-error]'), WAIT).toBe('Still down. (attempt 4)');
	await updatesInPlace('[data-error]', '[data-next]', 'Still down. (attempt 5)');
	service.down.clear();
	click('[data-reset]');
	await expect.poll(() => textOf('[data-ok]'), WAIT).toBe('first ready #1');
	expect(document.querySelector('[data-error]')).toBeNull();
	click('[data-next]');
	service.down.set('later', 'Later down.');
	click('[data-switch]');
	// A failed refresh keeps the shown content and draws the @catch after it.
	await expect.poll(() => textOf('[data-error]'), WAIT).toBe('Later down. (attempt 6)');
	expect(textOf('[data-ok]')).toBe('first ready #1');
	await updatesInPlace('[data-error]', '[data-next]', 'Later down. (attempt 7)');
}

test('CSR: @catch text mixing the error with state updates in place through retries, a new error and a failed refresh', async () => {
	await render(Page);
	await retryPendingKeepsTheShownError();
});

test('SSR: @catch text of a failure rendered on the server updates in place through retries, a new error and a failed refresh', async () => {
	const { container } = await renderSSR(Page);
	expect(container.querySelector('[data-error]')?.textContent).toBe('Service down. (attempt 1)');
	await retryPendingKeepsTheShownError();
});

async function rowsFailOnTheirOwn() {
	await expect.poll(() => textOf('[data-region="north"] [data-ok]'), WAIT).toBe('north ready');
	await expect
		.poll(() => textOf('[data-region="south"] [data-error]'), WAIT)
		.toBe('South down. (try 1 for south)');
	await updatesInPlace('[data-region="south"] [data-error]', '[data-region="south"] [data-next]', 'South down. (try 2 for south)');
	await updatesInPlace('[data-region="south"] [data-error]', '[data-region="south"] [data-next]', 'South down. (try 3 for south)');
	service.down.set('east', 'East down.');
	click('[data-add]');
	await expect
		.poll(() => textOf('[data-region="east"] [data-error]'), WAIT)
		.toBe('East down. (try 1 for east)');
	await updatesInPlace('[data-region="east"] [data-error]', '[data-region="east"] [data-next]', 'East down. (try 2 for east)');
	expect(textOf('[data-region="south"] [data-error]')).toBe('South down. (try 3 for south)');
}

test("CSR: a keyed row's own @catch text updates in place", async () => {
	resetService([['south', 'South down.']]);
	await render(Rows);
	await rowsFailOnTheirOwn();
});

test("SSR: a keyed row's own @catch text, failed on the server, updates in place", async () => {
	resetService([['south', 'South down.']]);
	const { container } = await renderSSR(Rows);
	expect(container.querySelector('[data-region="south"] [data-error]')?.textContent).toBe(
		'South down. (try 1 for south)',
	);
	await rowsFailOnTheirOwn();
});

function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes))
				script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

test('SSR: @catch text of a failure streamed after the first flush updates in place', async () => {
	const { shell, appends } = await renderStream(SlowPage);
	expect(appends).toHaveLength(1);
	const { container } = renderServerHTML(shell);
	expect(textOf('[data-pending]')).toBe('Loading');
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(() => textOf('[data-error]'), WAIT).toBe('Attempt 1: Slow down.');
	await updatesInPlace('[data-error]', '[data-next]', 'Attempt 2: Slow down.');
	await updatesInPlace('[data-error]', '[data-next]', 'Attempt 3: Slow down.');
});

test("SSR: a keyed row's own @catch text streamed after the first flush updates in place", async () => {
	const { shell, appends } = await renderStream(SlowRows);
	expect(appends).toHaveLength(1);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	const slow = '[data-region="slow"] [data-error]';
	await expect.poll(() => textOf(slow), WAIT).toBe('Slow down. (try 1 for slow)');
	expect(textOf('[data-region="north"] [data-ok]')).toBe('north ready');
	await updatesInPlace(slow, '[data-region="slow"] [data-next]', 'Slow down. (try 2 for slow)');
	await updatesInPlace(slow, '[data-region="slow"] [data-next]', 'Slow down. (try 3 for slow)');
});

test("SSR: a click on a streamed row's @catch before the page wakes reaches that page's code when another streamed page came first", async () => {
	const held: Array<() => void> = [];
	Object.defineProperty(Element.prototype, '__mClock', {
		configurable: true,
		get: () => ({ frame: (run: () => void) => run(), idle: (run: () => void) => held.push(run) }),
	});
	try {
		const first = await renderStream(SlowPage);
		appendStreamed(renderServerHTML(first.shell).container, first.appends[0]!);
		await expect.poll(() => textOf('[data-error]'), WAIT).toBe('Attempt 1: Slow down.');
		const second = await renderStream(SlowRows);
		appendStreamed(renderServerHTML(second.shell).container, second.appends[0]!);
		const slow = '[data-region="slow"] [data-error]';
		await expect.poll(() => textOf(slow), WAIT).toBe('Slow down. (try 1 for slow)');
		expect(held.length).toBeGreaterThan(0);
		await updatesInPlace(slow, '[data-region="slow"] [data-next]', 'Slow down. (try 2 for slow)');
	} finally {
		delete (Element.prototype as { __mClock?: unknown }).__mClock;
		for (const run of held.splice(0)) run();
	}
});
