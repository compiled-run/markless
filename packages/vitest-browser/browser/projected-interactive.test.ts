import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import NestedPage from './fixtures/projected-state-nested-page.tsrx';
import PairPage from './fixtures/projected-state-pair-page.tsrx';
import Page from './fixtures/projected-state-page.tsrx';

// A component written inside another component's tag is PROJECTED. The
// projected child owns its own state() and its own event handler, so composing
// it must carry its cells, events and dom updates under its p<n>: instance
// path exactly as a directly composed child does.
afterEach(() => cleanup());

type StatePayload = {
	readonly cells: ReadonlyArray<{ readonly graphNodeId: string }>;
	readonly computed: ReadonlyArray<{ readonly graphNodeId: string }>;
};

function statePayloadIds(container: ParentNode): string[] {
	const script = container.querySelector<HTMLScriptElement>('script[type="markless/state"]');
	if (!script) throw new Error('Expected markless/state payload script.');
	const payload = JSON.parse(script.textContent ?? 'null') as StatePayload;
	return [...payload.cells, ...payload.computed].map((node) => node.graphNodeId);
}

function trigger(container: ParentNode, scope?: string) {
	const host = scope ? container.querySelector(`[data-pair="${scope}"]`) : container;
	return host?.querySelector<HTMLButtonElement>('[data-projected-trigger]') ?? null;
}

async function expectCountsOnClick(container: ParentNode) {
	const button = trigger(container);
	expect(button).not.toBeNull();
	expect(button?.textContent).toBe('0');
	expect(container.querySelector('[data-projected-root]')?.contains(button!)).toBe(true);

	button?.click();
	await expect.poll(() => trigger(container)?.textContent).toBe('1');
	// The wrapping root owns no state of its own; composing the child must not
	// disturb the markup it contributed.
	expect(container.querySelector('[data-projected-root]')?.tagName).toBe('DIV');
}

async function expectPairIsolated(container: ParentNode) {
	const a = trigger(container, 'a');
	const b = trigger(container, 'b');
	expect(a).not.toBeNull();
	expect(b).not.toBeNull();

	a?.click();
	await expect.poll(() => trigger(container, 'a')?.textContent).toBe('1');
	expect(trigger(container, 'b')?.textContent).toBe('0');
}

test('CSR: a projected child owning state and an event is interactive', async () => {
	const screen = await render(Page);
	await expectCountsOnClick(screen.container as HTMLElement);
});

test('CSR: two projected instances of one child keep separate state', async () => {
	const screen = await render(PairPage);
	await expectPairIsolated(screen.container as HTMLElement);
});

test('CSR: a child projected through a projected child stays interactive', async () => {
	const screen = await render(NestedPage);
	const container = screen.container as HTMLElement;
	const middle = container.querySelector('[data-projected-middle]');
	expect(container.querySelector('[data-projected-root]')?.contains(middle!)).toBe(true);
	await expectCountsOnClick(container);
});

test('SSR: a projected interactive child resumes with the same DOM', async () => {
	const screen = await renderSSR(Page);
	await expectCountsOnClick(screen.container);
});

test('SSR: two projected instances resume with distinct qualified ids', async () => {
	const screen = await renderSSR(PairPage);
	const hitIds = statePayloadIds(screen.container).filter((id) => id.endsWith('state:hits'));
	expect(new Set(hitIds).size).toBe(2);
	await expectPairIsolated(screen.container);
});
