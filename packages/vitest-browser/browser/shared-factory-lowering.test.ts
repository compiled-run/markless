import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderSSRPhased } from '../src/index.ts';
import Page from './fixtures/tri-page.tsrx';

// The shared-factory lowering seam, proven in a browser. Every assertion here
// failed with `ReferenceError: t is not defined` from the residue reader, or
// with the consumer's omitted prop erasing the factory's own initial, before
// the lowering landed.
afterEach(() => cleanup());

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-widget="${name}"]`);
	if (!host) throw new Error(`Expected widget "${name}".`);
	return {
		root: host.querySelector('[data-tri-root]'),
		trigger: host.querySelector<HTMLButtonElement>('[data-tri-trigger]'),
		counter: host.querySelector('[data-tri-counter]'),
	};
}

// Widget "a" is seeded with the string 'mixed'; widget "b" omits the prop and
// keeps the factory's own `false`. Both readings are composite expressions over
// the shared instance, and the cell only holds 'mixed' because the factory's
// `as` cast still produced a known initial value.
function expectCompositesRendered(container: ParentNode) {
	const a = widget(container, 'a');
	const b = widget(container, 'b');

	expect(a.trigger?.getAttribute('aria-checked')).toBe('mixed');
	expect(a.trigger?.hasAttribute('ui-checked')).toBe(false);
	expect(a.root?.hasAttribute('ui-mixed')).toBe(true);
	expect(a.root?.hasAttribute('ui-blocked')).toBe(true);

	expect(b.trigger?.getAttribute('aria-checked')).toBe('false');
	expect(b.trigger?.hasAttribute('ui-checked')).toBe(false);
	expect(b.root?.hasAttribute('ui-mixed')).toBe(false);
	// The omitted `blocked` prop seeds nothing, so the factory's false stands.
	expect(b.root?.hasAttribute('ui-blocked')).toBe(false);
	expect(b.trigger?.textContent).toBe('false');
}

// The factory method holds a local and three statements: the mixed -> checked
// rule, the write, and the counter bump. All three run, in this widget alone.
async function expectMethodLocalRuns(container: ParentNode) {
	expect(widget(container, 'a').counter?.textContent).toBe('0');
	expect(widget(container, 'b').counter?.textContent).toBe('0');

	widget(container, 'a').trigger?.click();
	await expect.poll(() => widget(container, 'a').trigger?.textContent).toBe('true');
	expect(widget(container, 'a').counter?.textContent).toBe('1');
	expect(widget(container, 'b').trigger?.textContent).toBe('false');
	expect(widget(container, 'b').counter?.textContent).toBe('0');

	widget(container, 'a').trigger?.click();
	await expect.poll(() => widget(container, 'a').trigger?.textContent).toBe('false');
	expect(widget(container, 'a').counter?.textContent).toBe('2');
}

test('CSR: composites over a shared instance render, and an omitted seed keeps the factory initial', async () => {
	const screen = await render(Page);
	expectCompositesRendered(screen.container as HTMLElement);
});

test('CSR: a factory method local runs its whole body for its own widget', async () => {
	const screen = await render(Page);
	await expectMethodLocalRuns(screen.container as HTMLElement);
});

test('SSR: the composites are in the server HTML, and the omitted seed is absent there', async () => {
	const phased = await renderSSRPhased(Page);

	expect(phased.html).toContain('aria-checked="mixed"');
	expect(phased.html).toContain('aria-checked="false"');
	const rootTags = phased.html.match(/<div[^>]*data-tri-root[^>]*>/g) ?? [];
	expect(rootTags.length).toBe(2);
	expect(rootTags.filter((tag) => tag.includes('ui-blocked')).length).toBe(1);
	expect(rootTags.filter((tag) => tag.includes('ui-mixed')).length).toBe(1);

	expectCompositesRendered(phased.mount().container);
});

test('SSR resume: the method local runs after resume', async () => {
	const screen = await renderSSR(Page);
	expectCompositesRendered(screen.container);
	await expectMethodLocalRuns(screen.container);
});
