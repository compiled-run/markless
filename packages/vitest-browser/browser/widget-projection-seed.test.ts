import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderSSRPhased } from '../src/index.ts';
import NestedPage from './fixtures/chk-nested-page.tsrx';
import Page from './fixtures/chk-page.tsrx';

// A widget part is PROJECTED into its widget root, so the root's body — which
// seeds the widget's shared instance from its own props — must run before the
// part renders. These witnesses read the seeded config from the part, not from
// the root that wrote it.
afterEach(() => cleanup());

function trigger(container: ParentNode, name: string) {
	const part = container.querySelector(`[data-widget="${name}"] [data-chk-trigger]`);
	if (!part) throw new Error(`Expected the trigger of widget "${name}".`);
	return part;
}

// Widget "a" is rendered with `disabled={true} name="alpha"`, widget "b" with
// both props omitted: the parts of one page disagree because each reads its own
// widget instance.
function expectPartsReadTheirSeed(container: ParentNode) {
	expect(trigger(container, 'a').hasAttribute('ui-disabled')).toBe(true);
	expect(trigger(container, 'a').getAttribute('data-name')).toBe('alpha');
	expect(trigger(container, 'b').hasAttribute('ui-disabled')).toBe(false);
	expect(trigger(container, 'b').getAttribute('data-name')).toBe('');
}

test('CSR: a projected part renders the config its widget root seeded', async () => {
	const screen = await render(Page);
	expectPartsReadTheirSeed(screen.container as HTMLElement);
});

test('SSR: the part renders the seeded config in the raw server HTML', async () => {
	const phased = await renderSSRPhased(Page);

	const triggerTags = phased.html.match(/<button[^>]*data-chk-trigger[^>]*>/g) ?? [];
	expect(triggerTags.length).toBe(2);
	expect(triggerTags.filter((tag) => tag.includes('ui-disabled')).length).toBe(1);
	expect(triggerTags.filter((tag) => tag.includes('data-name="alpha"')).length).toBe(1);

	expectPartsReadTheirSeed(phased.mount().container);
});

test('SSR resume: the seeded config survives resume on both widgets', async () => {
	const screen = await renderSSR(Page);
	expectPartsReadTheirSeed(screen.container);
});

// The trigger sits inside a PANEL widget that is itself projected into the
// checkbox root: each part resolves the seed of its own family's instance.
function expectNestedSeeds(container: ParentNode) {
	expect(container.querySelector('[data-pnl-root]')?.getAttribute('data-tone')).toBe('calm');
	expect(container.querySelector('[data-pnl-label]')?.getAttribute('data-tone')).toBe('calm');
	expect(container.querySelector('[data-chk-trigger]')?.getAttribute('data-name')).toBe('outer');
	expect(container.querySelector('[data-chk-trigger]')?.hasAttribute('ui-disabled')).toBe(true);
}

test('CSR: a part nested in another widget resolves its own widget seed', async () => {
	const screen = await render(NestedPage);
	expectNestedSeeds(screen.container as HTMLElement);
});

test('SSR resume: nested projection resolves each widget seed', async () => {
	const screen = await renderSSR(NestedPage);
	expectNestedSeeds(screen.container);
});
