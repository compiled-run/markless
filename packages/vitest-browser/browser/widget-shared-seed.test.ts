import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderSSRPhased } from '../src/index.ts';
import Page from './fixtures/chk-page.tsrx';
import TallyPage from './fixtures/chk-session.tsrx';

// A `shared(factory, { scope: 'widget' })` family whose factory returns two
// computeds — `isChecked` as a named const, `label` written inline in the
// returned object literal — and whose root seeds the widget's shared state from
// its own prop. Widget "a" renders with `disabled={true}`, widget "b" with the
// prop omitted.
afterEach(() => cleanup());

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-widget="${name}"]`);
	if (!host) throw new Error(`Expected widget "${name}".`);
	return {
		root: host.querySelector('[data-chk-root]'),
		trigger: host.querySelector<HTMLButtonElement>('[data-chk-trigger]'),
		indicator: host.querySelector('[data-chk-indicator]'),
	};
}

// Both factory computeds render: the named-const one on the widget root, the
// inline one on a part. Both start from the factory's initial value.
function expectFactoryComputedsRender(container: ParentNode) {
	for (const name of ['a', 'b']) {
		expect(widget(container, name).root?.hasAttribute('ui-checked'), name).toBe(false);
		expect(widget(container, name).indicator?.getAttribute('data-label'), name).toBe('off');
	}
}

// Each widget owns its own graph: toggling one leaves the other alone.
async function expectWidgetsIndependent(container: ParentNode) {
	expect(widget(container, 'a').indicator?.textContent).toBe('false');
	expect(widget(container, 'b').indicator?.textContent).toBe('false');

	widget(container, 'a').trigger?.click();
	await expect.poll(() => widget(container, 'a').indicator?.textContent).toBe('true');
	expect(widget(container, 'b').indicator?.textContent).toBe('false');

	widget(container, 'b').trigger?.click();
	await expect.poll(() => widget(container, 'b').indicator?.textContent).toBe('true');
	expect(widget(container, 'a').indicator?.textContent).toBe('true');
}

// `ui-disabled` is a boolean attribute: the seeded `true` renders presence, the
// omitted prop renders no attribute at all. The seed replaces the factory
// initial for that widget instance ALONE, so two widgets of one family on one
// page disagree.
function expectSeededDisabled(container: ParentNode) {
	expect(widget(container, 'a').root?.hasAttribute('ui-disabled')).toBe(true);
	expect(widget(container, 'b').root?.hasAttribute('ui-disabled')).toBe(false);
	// The seed writes one property; the rest of the factory's initial survives.
	expect(widget(container, 'a').indicator?.textContent).toBe('false');
}

test('CSR: both factory computed forms render per widget', async () => {
	const screen = await render(Page);
	expectFactoryComputedsRender(screen.container as HTMLElement);
});

test('CSR: a root prop seeds its own widget instance only', async () => {
	const screen = await render(Page);
	expectSeededDisabled(screen.container as HTMLElement);
});

test('CSR: two widgets of one family with different configs stay independent', async () => {
	const screen = await render(Page);
	await expectWidgetsIndependent(screen.container as HTMLElement);
});

test('SSR: the seeded field is in the server HTML, and absent where the prop is omitted', async () => {
	const phased = await renderSSRPhased(Page);

	// One widget's ROOT TAG carries the attribute, the other's does not. (The
	// resume payload names the attribute too, so count the rendered tags.)
	const rootTags = phased.html.match(/<div[^>]*data-chk-root[^>]*>/g) ?? [];
	expect(rootTags.length).toBe(2);
	expect(rootTags.filter((tag) => tag.includes('ui-disabled')).length).toBe(1);
	expect(phased.html).toContain('data-label="off"');

	const screen = phased.mount();
	expectSeededDisabled(screen.container);
	expectFactoryComputedsRender(screen.container);
});

test('SSR resume: two seeded widgets resume and stay independent', async () => {
	const screen = await renderSSR(Page);
	expectSeededDisabled(screen.container);
	await expectWidgetsIndependent(screen.container);
});

// D2's flip witness rides a PAGE-scoped family: a widget-scoped shared computed
// does not yet refresh a part after a write (see the receipt), so the flip of an
// inline-declared factory computed is proven where nothing else is in the way.
test('CSR: an inline factory computed renders and flips', async () => {
	const screen = await render(TallyPage);
	const container = screen.container as HTMLElement;

	expect(container.querySelector('[data-tally-mark]')?.textContent).toBe('no');
	container.querySelector<HTMLButtonElement>('[data-tally-flip]')?.click();
	await expect
		.poll(() => container.querySelector('[data-tally-mark]')?.textContent)
		.toBe('yes');
});

test('SSR resume: an inline factory computed renders and flips', async () => {
	const screen = await renderSSR(TallyPage);
	const container = screen.container;

	expect(container.querySelector('[data-tally-mark]')?.textContent).toBe('no');
	container.querySelector<HTMLButtonElement>('[data-tally-flip]')?.click();
	await expect
		.poll(() => container.querySelector('[data-tally-mark]')?.textContent)
		.toBe('yes');
});
