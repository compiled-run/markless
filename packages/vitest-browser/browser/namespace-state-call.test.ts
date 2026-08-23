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
	expect(container.querySelectorAll('[data-nsc-root]').length).toBe(2);
	expect(container.querySelectorAll('[data-nsc-report]').length).toBe(2);

	// One instance per rendered widget, and not one more. The family's cell is
	// served once per widget root, at that root's own one-segment instance path.
	// A consumer part that merely READS the family must add none: the consumer
	// module adopted the definition, so it does not root it. When it did, each
	// widget served a second cell at the report's nested path (`c0:p2:…` beside
	// the root's `c0:…`) and the report read that one instead of the widget's.
	const familyCells = statePayloadIds(container).filter((id) =>
		id.endsWith('#nscShared/state:s'),
	);
	const instancePaths = familyCells.map((id) => id.slice(0, id.indexOf('shared:')));
	const segments = (instancePath: string) => instancePath.split(':').filter(Boolean).length;
	expect(instancePaths.filter((instancePath) => segments(instancePath) === 1).length).toBe(2);
	expect(instancePaths.filter((instancePath) => segments(instancePath) > 1)).toEqual([]);

	await expectConsumerReadsTheWidgetsOwnCell(container);
});
