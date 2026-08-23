import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/widget-root-handlers-page.tsrx';

// Two silent-dispatch defects on widget-rooting elements:
//
// 57 - a widget-root element honoured only its FIRST handler. The root carries
//      `onClick` and `onKeydown`; the keydown compiled clean and did nothing.
// 58 - a handler on a NESTED widget-rooting element matched its event record and
//      then its symbol module was never woken, so the body never ran.
//
// Both were silent: no compile refusal, no runtime error, no effect.
afterEach(() => cleanup());

function reads(container: ParentNode) {
	return {
		outer: container.querySelector<HTMLElement>('[data-wrh-outer]'),
		inner: container.querySelector<HTMLElement>('[data-wrh-inner]'),
		deep: container.querySelector<HTMLElement>('[data-wrh-deep]'),
		clicks: container.querySelector('[data-wrh-outer-clicks]'),
		keys: container.querySelector('[data-wrh-outer-keys]'),
		hits: container.querySelector('[data-wrh-inner-hits]'),
		taps: container.querySelector('[data-wrh-inner-taps]'),
		deepHits: container.querySelector('[data-wrh-deep] [data-wrh-inner-hits]'),
	};
}

function press(target: HTMLElement) {
	target.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
}

// Defect 57: the SECOND handler on a widget-root element runs.
async function expectSecondHandlerRuns(container: ParentNode) {
	const { outer, clicks, keys } = reads(container);
	expect(outer).not.toBeNull();
	await expect.poll(() => clicks?.textContent).toBe('0');
	expect(keys?.textContent).toBe('0');

	// The first handler still works.
	outer?.click();
	await expect.poll(() => clicks?.textContent).toBe('1');

	// The second handler on the same widget-root element also works.
	press(outer as HTMLElement);
	await expect.poll(() => keys?.textContent).toBe('1');

	press(outer as HTMLElement);
	await expect.poll(() => keys?.textContent).toBe('2');
	expect(clicks?.textContent).toBe('1');
}

// Defect 58: a handler on a widget-rooting element nested inside another widget
// wakes its symbol and runs. This is the `tree.item` / `select.item` position.
async function expectNestedRootHandlerRuns(container: ParentNode) {
	const { inner, hits, taps } = reads(container);
	expect(inner).not.toBeNull();
	await expect.poll(() => hits?.textContent).toBe('0');
	expect(taps?.textContent).toBe('0');

	// The click the part already carried.
	inner?.click();
	await expect.poll(() => taps?.textContent).toBe('1');

	// The keydown added beside it - defect 57's second-handler case, on the
	// nested widget root where it was actually measured.
	press(inner as HTMLElement);
	await expect.poll(() => hits?.textContent).toBe('1');

	press(inner as HTMLElement);
	await expect.poll(() => hits?.textContent).toBe('2');
	expect(taps?.textContent).toBe('1');
}

// A key pressed on the nested root bubbles to the enclosing widget root, whose
// own keydown must run too: the tree handles every key on `tree.root` while the
// row would answer for itself, so both sit on one bubble path.
async function expectBubblesToEnclosingRoot(container: ParentNode) {
	const { inner, hits, keys } = reads(container);
	await expect.poll(() => `hits=${hits?.textContent} keys=${keys?.textContent}`).toBe(
		'hits=0 keys=0',
	);

	press(inner as HTMLElement);
	await expect.poll(() => `hits=${hits?.textContent} keys=${keys?.textContent}`).toBe(
		'hits=1 keys=1',
	);
}

test('CSR: a widget-root element honours its second handler', async () => {
	const screen = await render(Page);
	await expectSecondHandlerRuns(screen.container as HTMLElement);
});

test('CSR: a handler on a nested widget-rooting element runs', async () => {
	const screen = await render(Page);
	await expectNestedRootHandlerRuns(screen.container as HTMLElement);
});

test('SSR resume: a widget-root element honours its second handler', async () => {
	const screen = await renderSSR(Page);
	await expectSecondHandlerRuns(screen.container);
});

test('SSR resume: a handler on a nested widget-rooting element runs', async () => {
	const screen = await renderSSR(Page);
	await expectNestedRootHandlerRuns(screen.container);
});

// The `tree.item` position exactly: an item projected through another item's
// content part, two widget-rooting levels deep. Its own handler must run and
// must touch its OWN instance, not the level above it.
async function expectDeepItemHandlerRuns(container: ParentNode) {
	const { deep, hits, deepHits } = reads(container);
	expect(deep).not.toBeNull();
	await expect
		.poll(() => `outerItem=${hits?.textContent} innerItem=${deepHits?.textContent}`)
		.toBe('outerItem=0 innerItem=0');

	press(deep as HTMLElement);
	await expect
		.poll(() => `outerItem=${hits?.textContent} innerItem=${deepHits?.textContent}`)
		.toBe('outerItem=1 innerItem=1');
}

test('CSR: a handler on an item projected inside another item runs per level', async () => {
	const screen = await render(Page);
	await expectDeepItemHandlerRuns(screen.container as HTMLElement);
});

test('SSR resume: a handler on an item projected inside another item runs per level', async () => {
	const screen = await renderSSR(Page);
	await expectDeepItemHandlerRuns(screen.container);
});

test('CSR: a key on a nested widget root also runs the enclosing root handler', async () => {
	const screen = await render(Page);
	await expectBubblesToEnclosingRoot(screen.container as HTMLElement);
});

test('SSR resume: a key on a nested widget root also runs the enclosing root handler', async () => {
	const screen = await renderSSR(Page);
	await expectBubblesToEnclosingRoot(screen.container);
});
