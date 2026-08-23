import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/namespace-state-consumer.tsrx';

// The ratified consumer surface: a component in another module reaches a
// family's widget-scoped shared definition through a plain .ts barrel with a
// namespace-member call (`family.state()`), and reads a live cell off it.
//
// Two things have to hold at once. The compile has to resolve the member call
// through the barrel's aliased re-export to the owning .tsrx's definition, so
// the consumer's read lands on the same graph node the family's own parts read.
// And the compiled family module has to keep the shared binding a real runtime
// export, or the barrel's re-export fails to link at all.
afterEach(() => cleanup());

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-widget="${name}"]`);
	if (!host) throw new Error(`Expected widget "${name}".`);
	return {
		root: host.querySelector('[data-nsc-root]'),
		trigger: host.querySelector<HTMLButtonElement>('[data-nsc-trigger]'),
		report: host.querySelector('[data-nsc-report]'),
	};
}

async function expectConsumerReadsTheWidgetsOwnCell(container: ParentNode) {
	expect(widget(container, 'a').report?.textContent).toBe('closed');
	expect(widget(container, 'b').report?.textContent).toBe('closed');

	widget(container, 'a').trigger?.click();
	await expect.poll(() => widget(container, 'a').report?.textContent).toBe('open');
	// Instance qualification: the consumer's call resolved widget a's instance,
	// not the definition at large.
	expect(widget(container, 'b').report?.textContent).toBe('closed');
	expect(widget(container, 'a').root?.hasAttribute('ui-open')).toBe(true);
	expect(widget(container, 'b').root?.hasAttribute('ui-open')).toBe(false);

	widget(container, 'b').trigger?.click();
	await expect.poll(() => widget(container, 'b').report?.textContent).toBe('open');
	expect(widget(container, 'a').report?.textContent).toBe('open');
}

test('CSR: a namespace-member shared call through a barrel reads the widget it is under', async () => {
	const screen = await render(Page);
	await expectConsumerReadsTheWidgetsOwnCell(screen.container as HTMLElement);
});

test('SSR: the served markup carries the consumer read, and resume keeps it live', async () => {
	const screen = await renderSSR(Page);
	const container = screen.container as HTMLElement;
	expect(container.querySelectorAll('[data-nsc-report]').length).toBe(2);
	await expectConsumerReadsTheWidgetsOwnCell(container);
});
