import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RangePage from './fixtures/cblk-range-page.tsrx';
import UnavailablePage from './fixtures/cblk-unavailable-page.tsrx';

// Three framework behaviours the calendar family measured, each reduced to the
// smallest widget that shows it: a boolean root prop read from a shared method
// a PART calls, an array-valued root prop read from a part's computed(), and an
// element() handle bound by one part and named by another's IDREF under SSR.
afterEach(() => cleanup());

function day(container: ParentNode, value: string) {
	return (
		[...container.querySelectorAll<HTMLButtonElement>('[data-cblk-item]')].find(
			(candidate) => candidate.textContent?.trim() === value,
		) ?? null
	);
}

function text(container: ParentNode, selector: string) {
	return container.querySelector(selector)?.textContent;
}

async function expectTheRangeArmRuns(container: ParentNode) {
	const first = day(container, '2026-08-10');
	const second = day(container, '2026-08-12');
	expect(first).not.toBeNull();
	await expect.poll(() => text(container, '[data-cblk-hits]')).toBe('0');

	first?.click();
	// The range arm writes the anchor and leaves the value alone. A `range` that
	// reads false inside the copied body writes the value on the first press.
	await expect.poll(() => text(container, '[data-cblk-hits]')).toBe('1');
	await expect.poll(() => text(container, '[data-cblk-anchor]')).toBe('2026-08-10');
	await expect.poll(() => text(container, '[data-cblk-picked]')).toBe('');
	await expect.poll(() => text(container, '[data-cblk-seen]')).toBe('none');

	second?.click();
	await expect.poll(() => text(container, '[data-cblk-anchor]')).toBe('');
	await expect.poll(() => text(container, '[data-cblk-picked]')).toBe('2026-08-10..2026-08-12');
}

// The same two presses, asked only whether the consumer heard them. The widget
// root stored the callback and the method body ran to its dispatch, so a silent
// zero here is a part whose enclosing component projects into the root reaching
// no answer for the slot - the shape no per-edge binding names.
async function expectTheConsumerHears(container: ParentNode) {
	day(container, '2026-08-10')?.click();
	day(container, '2026-08-12')?.click();
	await expect.poll(() => text(container, '[data-cblk-calls]')).toBe('1');
	await expect.poll(() => text(container, '[data-cblk-seen]')).toBe('2026-08-10..2026-08-12');
}

async function expectTheArrayPropReaches(container: ParentNode) {
	const open = day(container, '2026-08-10');
	const blocked = day(container, '2026-08-12');
	expect(blocked).not.toBeNull();
	await expect
		.poll(() => `${open?.getAttribute('aria-disabled')}|${open?.hasAttribute('ui-unavailable')}`)
		.toBe('false|false');
	await expect
		.poll(
			() => `${blocked?.getAttribute('aria-disabled')}|${blocked?.hasAttribute('ui-unavailable')}`,
		)
		.toBe('true|true');

	// The same array is read inside the shared method, so the blocked day refuses.
	blocked?.click();
	await expect.poll(() => text(container, '[data-cblk-hits]')).toBe('1');
	await expect.poll(() => text(container, '[data-cblk-picked]')).toBe('');

	open?.click();
	await expect.poll(() => text(container, '[data-cblk-picked]')).toBe('2026-08-10');
}

function expectTheIdrefResolves(container: ParentNode) {
	const content = container.querySelector('[data-cblk-content]');
	const title = container.querySelector('[data-cblk-title]');
	expect(title?.id).toMatch(/^mx-/);
	expect(content?.getAttribute('aria-labelledby')).toBe(title?.id);
}

test('CSR: a boolean root prop reaches the copied method body a part calls', async () => {
	const screen = await render(RangePage);
	await expectTheRangeArmRuns(screen.container as HTMLElement);
});

test('SSR resume: a boolean root prop reaches the copied method body a part calls', async () => {
	const screen = await renderSSR(RangePage);
	await expectTheRangeArmRuns(screen.container);
});

test('CSR: a part’s dispatch reaches the consumer callback', async () => {
	const screen = await render(RangePage);
	await expectTheConsumerHears(screen.container as HTMLElement);
});

test('SSR resume: a part’s dispatch reaches the consumer callback', async () => {
	const screen = await renderSSR(RangePage);
	await expectTheConsumerHears(screen.container);
});

test('CSR: an array-valued root prop reaches a part’s computed()', async () => {
	const screen = await render(UnavailablePage);
	await expectTheArrayPropReaches(screen.container as HTMLElement);
});

test('SSR resume: an array-valued root prop reaches a part’s computed()', async () => {
	const screen = await renderSSR(UnavailablePage);
	await expectTheArrayPropReaches(screen.container);
});

test('CSR: a part’s IDREF names the element another part bound', async () => {
	const screen = await render(RangePage);
	expectTheIdrefResolves(screen.container as HTMLElement);
});

test('SSR resume: a part’s IDREF names the element another part bound', async () => {
	const screen = await renderSSR(RangePage);
	expectTheIdrefResolves(screen.container);
});
