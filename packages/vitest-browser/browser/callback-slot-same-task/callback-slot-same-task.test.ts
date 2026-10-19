import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './cst-page.tsrx';

// A widget method that writes its own state and then calls the consumer's
// callback is one synchronous run as authored, so both sets of writes land in one
// task, however long the callback's own code takes to load.
afterEach(() => cleanup());

const body = () => document.querySelector<HTMLElement>('[data-sheet-body]');
const dismissals = () => document.querySelector('[data-sheet-dismissals]')?.textContent;

// A message posted from a mutation is read only after every microtask of that
// task has drained, so a page caught half-written here would paint half-written.
function watchTaskEnds(expected: () => string) {
	const torn: string[] = [];
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		if (body()?.hidden && dismissals() !== expected())
			torn.push(`hidden with dismissals=${dismissals()}`);
	};
	const observer = new MutationObserver(() => channel.port2.postMessage(null));
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true,
	});
	return {
		torn,
		stop() {
			observer.disconnect();
			channel.port1.close();
		},
	};
}

async function expectDismissLandsInOneTask() {
	const open = document.querySelector<HTMLButtonElement>('[data-sheet-open]')!;
	const dismiss = document.querySelector<HTMLButtonElement>('[data-sheet-dismiss]')!;
	let count = 0;
	const watch = watchTaskEnds(() => String(count));

	// The page's own open warms the sheet's attribute updates; the callback stays cold.
	open.click();
	await expect.poll(() => body()?.hidden).toBe(false);
	for (count = 1; count <= 2; count++) {
		dismiss.click();
		await expect.poll(() => body()?.hidden).toBe(true);
		expect(dismissals()).toBe(String(count));
		open.click();
		await expect.poll(() => body()?.hidden).toBe(false);
	}
	await new Promise((resolve) => setTimeout(resolve, 20));
	watch.stop();
	expect(watch.torn).toEqual([]);
}

test('CSR: a cold first call to a consumer callback lands with the widget writes', async () => {
	await render(Page);
	await expectDismissLandsInOneTask();
});

test('SSR: a cold first call to a consumer callback lands with the widget writes', async () => {
	await renderSSR(Page);
	await expectDismissLandsInOneTask();
});
