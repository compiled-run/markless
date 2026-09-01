import { renderSSRIslands } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import MultiIslandAccordion from './multi-island-accordion.tsrx';

const Frames = page.getByTestId('frame');
const ShippingTriggers = page.getByTestId('shipping-trigger');
const ShippingContents = page.getByTestId('shipping-content');

function el(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found;
}

// The multi-island lever itself: two scenario roots composed as SEPARATE
// islands and merged through the router's real composeMdxState/composeMdxView,
// served as one payload the browser resumes once. This suite proves the lever
// carries a live page — both islands render and the first island's gesture
// reaches the runtime through the island resume module. Cross-island isolation
// (distinct widget ids, disjoint rosters) is the next suite's subject: on
// today's merge those ids collide, and pinning them here would only re-witness
// a defect this harness exists to make witnessable.
test('SSR islands: two same-shape islands merge into one page that resumes', async () => {
	await renderSSRIslands([MultiIslandAccordion, MultiIslandAccordion]);

	expect(Frames.all()).toHaveLength(2);
	expect(ShippingTriggers.all()).toHaveLength(2);
	expect(el(ShippingTriggers.nth(0)).getAttribute('aria-expanded')).toBe('false');
	expect(el(ShippingTriggers.nth(1)).getAttribute('aria-expanded')).toBe('false');

	await userEvent.click(el(ShippingTriggers.nth(0)));

	await expect.poll(() => el(ShippingTriggers.nth(0)).getAttribute('aria-expanded')).toBe('true');
	expect(el(ShippingContents.nth(0)).hasAttribute('hidden')).toBe(false);
});
