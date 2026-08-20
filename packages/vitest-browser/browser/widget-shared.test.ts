import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import NestedPage from './fixtures/sel-nested-page.tsrx';
import Page from './fixtures/sel-page.tsrx';

// `shared(factory, { scope: 'widget' })` is one graph per rendered widget. The
// root/trigger/content pieces of one widget resolve the same instance; a second
// widget of the same family on the same page resolves a different one.
//
// No SSR case here: a compound family authored in ONE .tsrx module has one SSR
// entry for the whole module (source-module.ts binds `renderSsr` to the module
// root), so server-rendering <Trigger/> renders <Root/> instead. That gap is
// independent of widget scope; the composed ids this scope mints are covered at
// the composition boundary in packages/web/test/widget-shared.test.ts.
afterEach(() => cleanup());

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-widget="${name}"]`);
	if (!host) throw new Error(`Expected widget "${name}".`);
	return {
		root: host.querySelector('[data-sel-root]'),
		trigger: host.querySelector<HTMLButtonElement>('[data-sel-trigger]'),
		content: host.querySelector('[data-sel-content]'),
	};
}

async function expectWidgetsIsolated(container: ParentNode) {
	const a = widget(container, 'a');
	const b = widget(container, 'b');
	expect(a.content?.textContent).toBe('false');
	expect(b.content?.textContent).toBe('false');

	a.trigger?.click();
	await expect.poll(() => widget(container, 'a').content?.textContent).toBe('true');
	expect(widget(container, 'b').content?.textContent).toBe('false');
	// `ui-open={s.open}` is a boolean attribute: true renders presence, false
	// renders no attribute at all.
	expect(widget(container, 'a').root?.hasAttribute('ui-open')).toBe(true);
	expect(widget(container, 'b').root?.hasAttribute('ui-open')).toBe(false);

	b.trigger?.click();
	await expect.poll(() => widget(container, 'b').content?.textContent).toBe('true');
	expect(widget(container, 'a').content?.textContent).toBe('true');
}

test('CSR: a trigger opens only its own widget', async () => {
	const screen = await render(Page);
	await expectWidgetsIsolated(screen.container as HTMLElement);
});

async function expectNestedIsolated(container: ParentNode) {
	const selRoot = container.querySelector('[data-sel-root]');
	const popRoot = container.querySelector('[data-pop-root]');
	expect(selRoot?.contains(popRoot!)).toBe(true);

	container.querySelector<HTMLButtonElement>('[data-pop-trigger]')?.click();
	await expect
		.poll(() => container.querySelector('[data-pop-root]')?.hasAttribute('ui-open'))
		.toBe(true);
	expect(container.querySelector('[data-sel-root]')?.hasAttribute('ui-open')).toBe(false);
	expect(container.querySelector('[data-sel-content]')?.textContent).toBe('false');

	container.querySelector<HTMLButtonElement>('[data-sel-trigger]')?.click();
	await expect
		.poll(() => container.querySelector('[data-sel-content]')?.textContent)
		.toBe('true');
	expect(container.querySelector('[data-pop-root]')?.hasAttribute('ui-open')).toBe(true);
}

test('CSR: a widget projected into another widget content resolves its own instance', async () => {
	const screen = await render(NestedPage);
	await expectNestedIsolated(screen.container as HTMLElement);
});
