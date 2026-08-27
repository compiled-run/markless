import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import SeedProjectedChildrenPage from './page.tsrx';

// The seed pass runs before a projection renders, so a part seeding from its own
// `children` used to see undefined whenever the consumer wrote that text between
// the tags instead of as a prop. Static text is spelled in the compiled chunk, so
// both render paths now hand it to the seed. The sibling bar paints during the
// projection - there is no second paint - which is what makes this observable.
afterEach(() => cleanup());

function bar(container: ParentNode, placement: string) {
	const found = container.querySelector(`[data-case="${placement}"] [data-meter-bar]`);
	if (!found) throw new Error(`Expected the bar of the "${placement}" placement.`);
	return found;
}

function label(container: ParentNode, placement: string) {
	const found = container.querySelector(`[data-case="${placement}"] [data-meter-label]`);
	if (!found) throw new Error(`Expected the label of the "${placement}" placement.`);
	return found;
}

function expectSeededFromChildren(container: ParentNode) {
	expect(bar(container, 'text').getAttribute('aria-valuetext')).toBe('30 of 100 rows');
	expect(bar(container, 'text').getAttribute('aria-valuenow')).toBe('30');
	expect(label(container, 'text').textContent).toBe('30 of 100 rows');

	// The control: the same value spelled as a prop, which always reached the seed.
	expect(bar(container, 'prop').getAttribute('aria-valuetext')).toBe('40 of 100 rows');
	expect(label(container, 'prop').textContent).toBe('40 of 100 rows');

	// Children carrying markup have no value until they render, which is after the
	// seed pass, so the bar carries nothing. The compiler refuses this placement
	// where it can prove it (MARKLESS_SEED_CHILDREN_UNAVAILABLE); a part imported
	// from another module, as here, is not provable at the placement.
	expect(bar(container, 'markup').getAttribute('aria-valuetext') ?? '').toBe('');
	expect(label(container, 'markup').querySelector('em')?.textContent).toBe('50');
}

test('CSR: JSX text content reaches the seed the sibling bar reads', async () => {
	const screen = await render(SeedProjectedChildrenPage);
	expectSeededFromChildren(screen.container as HTMLElement);
});

test('SSR: the served HTML already carries the projected text on the sibling bar', async () => {
	const screen = await renderSSR(SeedProjectedChildrenPage);
	expectSeededFromChildren(screen.container);
});

test('each placement seeds its own widget, not its neighbour', async () => {
	const screen = await render(SeedProjectedChildrenPage);
	const container = screen.container as HTMLElement;

	expect(
		[...container.querySelectorAll('[data-meter-bar]')].map((node) =>
			node.getAttribute('aria-valuetext'),
		),
	).toEqual(['30 of 100 rows', '40 of 100 rows', null]);
});
