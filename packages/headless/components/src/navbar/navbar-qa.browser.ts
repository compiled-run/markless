import { render } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import UnwalkableControls from './scenarios/unwalkable-controls.tsrx';

const HomeLink = page.getByTestId('home-itemlink');
const PlaceholderLink = page.getByTestId('placeholder-itemlink');
const ProductsTrigger = page.getByTestId('products-itemtrigger');
const ProductsContent = page.getByTestId('products-itemcontent');
const DocsTrigger = page.getByTestId('docs-itemtrigger');
const DocsContent = page.getByTestId('docs-itemcontent');

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

async function settled() {
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// The bar's walk names two controls it will not land on: an anchor with no href
// and a button that is disabled. Neither can take focus, so landing on one would
// swallow the key rather than move anything.

test('CSR: the top-level walk steps over a link with nowhere to go', async () => {
	await render(UnwalkableControls);
	el(HomeLink).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(DocsTrigger));
	expect(document.activeElement).not.toBe(el(PlaceholderLink));
	expect(document.activeElement).not.toBe(el(ProductsTrigger));
});

test('CSR: the top-level walk steps over a trigger nobody may press', async () => {
	await render(UnwalkableControls);
	el(DocsTrigger).focus();

	// Backwards over the same two, and the walk wraps rather than stopping.
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(HomeLink));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(DocsTrigger));
});

test('CSR: a trigger nobody may press opens no dropdown', async () => {
	await render(UnwalkableControls);

	el(ProductsTrigger).click();
	await settled();
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(true);
	expect(el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');

	// The entry beside it still opens, so the refusal is that control's own.
	el(DocsTrigger).click();
	await expect.poll(() => el(DocsContent).hasAttribute('hidden')).toBe(false);
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(true);
});
