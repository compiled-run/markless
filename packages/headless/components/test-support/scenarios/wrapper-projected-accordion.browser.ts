import { renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import WrapperProjectedAccordion from './wrapper-projected-accordion.tsrx';

const Frame = page.getByTestId('frame');
const ShippingTrigger = page.getByTestId('shipping-trigger');
const ShippingContent = page.getByTestId('shipping-content');

function el(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found;
}

// The family's cells resolve through the widget-root registry rather than by
// concatenating instance paths, and that resolution runs in the reader's own
// module space. A family composed one wrapper deeper than the page reads with a
// path the page-space registry cannot answer, so the open-state write lands on a
// node no rendered widget owns and the trigger goes dead without a console
// error. Every other scenario here composes at page level, where the two spaces
// are the same string and the shear cannot show.
test('SSR: a family projected through a wrapper still opens on a click', async () => {
	await renderSSR(WrapperProjectedAccordion);

	expect(el(Frame).contains(el(ShippingTrigger))).toBe(true);
	expect(el(ShippingTrigger).getAttribute('aria-expanded')).toBe('false');

	await userEvent.click(el(ShippingTrigger));

	await expect.poll(() => el(ShippingTrigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(ShippingContent).hasAttribute('hidden')).toBe(false);
});
