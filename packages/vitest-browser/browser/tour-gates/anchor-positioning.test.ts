import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './anchor-page.tsrx';

// Gate 2. An anchor name written imperatively onto the consumer's element, and a
// card in an unrelated subtree that finds it from a <style> block under
// `@layer markless`. Every assertion is a relationship between two boxes, never
// an absolute coordinate, so the viewport the suite happens to run at is not
// baked in.
const VIEWPORT = { width: 800, height: 600 };

afterEach(async () => {
	cleanup();
	window.scrollTo(0, 0);
	await page.viewport(VIEWPORT.width, VIEWPORT.height);
});

function parts(container: ParentNode) {
	const find = <T extends HTMLElement>(selector: string): T => {
		const node = container.querySelector<T>(selector);
		if (!node) throw new Error(`Expected "${selector}".`);
		return node;
	};
	return {
		targetA: find<HTMLButtonElement>('[data-tg-target-a]'),
		targetB: find<HTMLButtonElement>('[data-tg-target-b]'),
		targetC: find<HTMLButtonElement>('[data-tg-target-c]'),
		targetPre: find<HTMLButtonElement>('[data-tg-target-pre]'),
		cardA: find('[data-tg-card-a]'),
		cardB: find('[data-tg-card-b]'),
		cardC: find('[data-tg-card-c]'),
		name: find<HTMLButtonElement>('[data-tg-name]'),
		named: find('[data-tg-named]'),
	};
}

/** True when the card sits directly under the target, within a pixel of rounding. */
function isParkedUnder(card: HTMLElement, target: HTMLElement): boolean {
	const cardBox = card.getBoundingClientRect();
	const targetBox = target.getBoundingClientRect();
	return Math.abs(cardBox.top - targetBox.bottom) <= 1 && Math.abs(cardBox.left - targetBox.left) <= 1;
}

async function expectTheCardFindsTheName(container: ParentNode) {
	const { targetA, cardA, name } = parts(container);
	expect(isParkedUnder(cardA, targetA)).toBe(false);

	name.click();

	await expect.poll(() => targetA.style.getPropertyValue('anchor-name')).toBe('--tg-a');
	await expect.poll(() => isParkedUnder(cardA, targetA)).toBe(true);
}

test('CSR: an imperative anchor-name on the consumer element places a card in another subtree', async () => {
	const screen = await render(Page);
	await expectTheCardFindsTheName(screen.container as HTMLElement);
});

test('SSR resume: the same imperative write places the same card', async () => {
	const screen = await renderSSR(Page);
	await expectTheCardFindsTheName(screen.container as HTMLElement);
});

test('the write preserves an anchor-name the consumer had already set', async () => {
	const screen = await render(Page);
	const { targetPre, name, named } = parts(screen.container as HTMLElement);

	name.click();

	await expect.poll(() => named.textContent).toBe('--tg-already');
	expect(targetPre.style.getPropertyValue('anchor-name')).toBe('--tg-already');
});

test('CSR: the card follows the target through a scroll and a resize with no JS', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	const { targetA, cardA, name } = parts(container);
	name.click();
	await expect.poll(() => isParkedUnder(cardA, targetA)).toBe(true);

	const before = targetA.getBoundingClientRect().top;
	window.scrollTo(0, 180);
	await expect.poll(() => targetA.getBoundingClientRect().top).not.toBe(before);
	await expect.poll(() => isParkedUnder(cardA, targetA)).toBe(true);

	await page.viewport(520, 480);
	await expect.poll(() => isParkedUnder(cardA, targetA)).toBe(true);
});

// The memo's warning was that a popover ancestor could hide the tour's name from
// the card. It cannot: `anchor-scope` names the ONE name it confines, so
// popover's `anchor-scope: --ui-popover` leaves every other name exported.
test('a popover ancestor scoping its own name does not hide the tour name', async () => {
	const screen = await render(Page);
	const { targetB, cardB, name } = parts(screen.container as HTMLElement);

	name.click();

	await expect.poll(() => isParkedUnder(cardB, targetB)).toBe(true);
});

// The copy-paste error the memo predicted, measured: scope the tour's OWN name on
// an ancestor of the target and the card outside that subtree stops finding it.
test('an ancestor scoping the tour name hides it from a card outside that subtree', async () => {
	const screen = await render(Page);
	const { targetC, cardC, name } = parts(screen.container as HTMLElement);

	name.click();

	await expect.poll(() => targetC.style.getPropertyValue('anchor-name')).toBe('--tg-c');
	expect(isParkedUnder(cardC, targetC)).toBe(false);
});
