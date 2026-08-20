import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import StaticApp from './fixtures/trigger-props.tsrx';

// A root prop reaches the parts through the family's shared instance. Only the
// static case is asserted: a shared seed is applied at initial render, so a live
// prop binding does not re-seed (recorded in notes/parity-table.md).
afterEach(() => cleanup());

function parts(container: ParentNode, testid: string) {
	const host = container.querySelector(`[data-testid="${testid}"]`);
	return {
		root: host?.querySelector('div') ?? null,
		trigger: host?.querySelector<HTMLButtonElement>('button:not([data-flip])') ?? null,
	};
}

function expectStaticDisabled(container: ParentNode) {
	const { root, trigger } = parts(container, 'trigger-props');
	expect(trigger).not.toBeNull();
	expect(trigger?.getAttribute('disabled')).toBe('');
	expect(root?.getAttribute('ui-disabled')).toBe('');
}

test('CSR: a root prop disables the trigger and marks the root', async () => {
	const screen = await render(StaticApp);
	expectStaticDisabled(screen.container as HTMLElement);
});

test('SSR: a root prop disables the trigger and marks the root', async () => {
	const screen = await renderSSR(StaticApp);
	expectStaticDisabled(screen.container);
});
