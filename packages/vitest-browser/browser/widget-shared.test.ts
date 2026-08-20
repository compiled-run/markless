import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import BarrelPage from './fixtures/sel-barrel-page.tsrx';
import NestedPage from './fixtures/sel-nested-page.tsrx';
import Page from './fixtures/sel-page.tsrx';

// `shared(factory, { scope: 'widget' })` is one graph per rendered widget. The
// root/trigger/content pieces of one widget resolve the same instance; a second
// widget of the same family on the same page resolves a different one.
//
// The family is authored in ONE .tsrx module, so the SSR cases below also prove
// the module surface serves each exported component its own SSR entry: composing
// <Trigger/> used to server-render <Root/>, because the module bound `renderSsr`
// to its root alone.
afterEach(() => cleanup());

type StatePayload = {
	readonly cells: ReadonlyArray<{ readonly graphNodeId: string }>;
	readonly computed: ReadonlyArray<{ readonly graphNodeId: string }>;
};

function statePayloadIds(container: HTMLElement): string[] {
	const script = container.querySelector<HTMLScriptElement>('script[type="markless/state"]');
	if (!script) throw new Error('Expected markless/state payload script.');
	const payload = JSON.parse(script.textContent ?? 'null') as StatePayload;
	return [...payload.cells, ...payload.computed].map((node) => node.graphNodeId);
}

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

// Server-rendered markup must carry each part's OWN element, and the payload
// must hold one widget-scoped state node per widget, qualified by the instance
// path composition minted. Both widgets resume, and a trigger still opens only
// its own widget.
function expectServerRenderedParts(container: HTMLElement) {
	for (const name of ['a', 'b']) {
		const parts = widget(container, name);
		expect(parts.root, `widget ${name} root`).not.toBeNull();
		expect(parts.trigger, `widget ${name} trigger`).not.toBeNull();
		expect(parts.content, `widget ${name} content`).not.toBeNull();
	}
	const openIds = statePayloadIds(container).filter((id) => id.endsWith('/state:s'));
	expect(new Set(openIds).size).toBe(2);
}

test('SSR: two widgets server-render their own parts and resume independently', async () => {
	const screen = await renderSSR(Page);
	expectServerRenderedParts(screen.container);
	await expectWidgetsIsolated(screen.container);
});

test('SSR: a parts barrel reaches each component of the family through member tags', async () => {
	const screen = await renderSSR(BarrelPage);
	expectServerRenderedParts(screen.container);
	await expectWidgetsIsolated(screen.container);
});

test('CSR: a parts barrel mounts each component of the family', async () => {
	const screen = await render(BarrelPage);
	await expectWidgetsIsolated(screen.container as HTMLElement);
});
