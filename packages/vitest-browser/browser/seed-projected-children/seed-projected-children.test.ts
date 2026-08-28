import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import SeedProjectedChildrenPage from './page.tsrx';

// The seed pass runs before a projection renders, so a part seeding from its own
// `children` used to see undefined whenever the consumer wrote that text between
// the tags instead of as a prop. A projection the compiled chunk spells in full -
// text, or markup with no expression in it - is known that early, and its TEXT
// CONTENT is what both render paths hand the seed. The sibling bar paints during
// the projection - there is no second paint - which is what makes this
// observable, and its `aria-valuetext` is what a screen reader says out loud.
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

	// Markup children: the bar reads the text, and the emphasis still renders.
	expect(bar(container, 'markup').getAttribute('aria-valuetext')).toBe('50 of 100 rows');
	expect(label(container, 'markup').textContent).toBe('50 of 100 rows');
	expect(label(container, 'markup').querySelector('em')?.textContent).toBe('50');

	// The statics are HTML, so the authored `&` arrives escaped. What the reader
	// hears is the character the label shows, not the entity that spells it.
	expect(bar(container, 'entity').getAttribute('aria-valuetext')).toBe('Tom & Jerry rows');
	expect(label(container, 'entity').textContent).toBe('Tom & Jerry rows');
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
	).toEqual(['30 of 100 rows', '40 of 100 rows', '50 of 100 rows', 'Tom & Jerry rows']);
});
