import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import { Child } from './catch-reset-served/child.tsrx';
import { FirstLoad } from './catch-reset-served/first-load.tsrx';
import { Nested } from './catch-reset-served/nested.tsrx';
import { Refresh } from './catch-reset-served/refresh.tsrx';
import { service } from './catch-reset-served/service.ts';

// `@catch (error, reset)` re-runs the failed value and swaps back to `@try`, whether the page was served or built in the browser.
afterEach(() => cleanup());
beforeEach(() => {
	service.down = new Set(['first', 'child', 'inner']);
});

const WAIT = { timeout: 3_000, interval: 10 };

function click(root: ParentNode, selector: string) {
	const target = root.querySelector<HTMLElement>(selector);
	if (!target) throw new Error(`Expected ${selector} in the rendered DOM.`);
	target.click();
}

async function resetRecovers(root: ParentNode, id: string) {
	await expect
		.poll(() => root.querySelector('[data-error]')?.textContent, WAIT)
		.toMatch(`${id} offline`);
	expect(root.querySelector('[data-ok]')).toBeNull();
	service.down.clear();
	click(root, '[data-reset]');
	await expect.poll(() => root.querySelector('[data-ok]')?.textContent, WAIT).toBe(`${id} ready`);
	expect(root.querySelector('[data-error]')).toBeNull();
	expect(root.querySelector('[data-pending]')).toBeNull();
}

async function refreshResetRecovers(root: ParentNode) {
	await expect.poll(() => root.querySelector('[data-ok]')?.textContent, WAIT).toBe('fine ready');
	service.down.add('later');
	click(root, '[data-switch]');
	await expect
		.poll(() => root.querySelector('[data-error]')?.textContent, WAIT)
		.toMatch('later offline');
	expect(root.querySelector('[data-ok]')?.textContent).toBe('fine ready');
	service.down.clear();
	click(root, '[data-reset]');
	await expect.poll(() => root.querySelector('[data-ok]')?.textContent, WAIT).toBe('later ready');
	expect(root.querySelector('[data-error]')).toBeNull();
}

async function nestedResetRecovers(root: ParentNode) {
	await expect
		.poll(() => root.querySelector('[data-outer]')?.textContent, WAIT)
		.toBe('outer ready');
	await resetRecovers(root, 'inner');
	expect(root.querySelector('[data-outer]')?.textContent).toBe('outer ready');
	expect(root.querySelector('[data-outer-error]')).toBeNull();
}

test('CSR: reset recovers a first-load failure', async () => {
	await resetRecovers((await render(FirstLoad)).container, 'first');
});
test('SSR: reset recovers a served first-load failure', async () => {
	await resetRecovers((await renderSSR(FirstLoad)).container, 'first');
});

test('CSR: reset recovers a failed refresh', async () => {
	await refreshResetRecovers((await render(Refresh)).container);
});
test('SSR: reset recovers a failed refresh after the page was served', async () => {
	await refreshResetRecovers((await renderSSR(Refresh)).container);
});

test('CSR: reset recovers a nested block and leaves the outer one shown', async () => {
	await nestedResetRecovers((await render(Nested)).container);
});
test('SSR: reset recovers a served nested block and leaves the outer one shown', async () => {
	await nestedResetRecovers((await renderSSR(Nested)).container);
});

// The failed inner block arrives inside the outer block's content, a few tasks before its own records register.
test('CSR: a reset pressed the moment a nested @catch appears recovers it', async () => {
	await nestedResetRecovers((await render(Nested)).container);
	await cleanup();
	service.down = new Set(['inner']);
	const pressed = new Promise<void>((resolve) => {
		const observer = new MutationObserver(() => {
			const reset = document.querySelector<HTMLElement>('[data-reset]');
			if (!reset) return;
			observer.disconnect();
			service.down.clear();
			reset.click();
			resolve();
		});
		observer.observe(document.body, { childList: true, subtree: true });
	});
	const root = (await render(Nested)).container;
	await pressed;
	await expect.poll(() => root.querySelector('[data-ok]')?.textContent, WAIT).toBe('inner ready');
	expect(root.querySelector('[data-error]')).toBeNull();
});

test('CSR: reset recovers a block inside a child component', async () => {
	await resetRecovers((await render(Child)).container, 'child');
});
test('SSR: reset recovers a served block inside a child component', async () => {
	await resetRecovers((await renderSSR(Child)).container, 'child');
});
