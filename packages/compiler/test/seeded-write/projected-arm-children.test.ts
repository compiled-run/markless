/**
 * A part that seeds a family cell from its own `children` and renders those same
 * children behind an `@if`. The plain projection leaves as an element-bound DOM
 * update, which composition rewrites to the caller's node; the arm's projection
 * leaves as a branch content read plus an arm-update symbol that reads the
 * child-local prop id itself. These pin both spellings, because only the first
 * one has a value composition can hand it.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

const source = `import { shared, state } from '@markless/core';

export const gaugeState = shared(() => {
	const gauge = state({ ownText: '' });
	return { ...gauge };
}, { scope: 'widget' });

export function GaugeNote({ children }) @{
	const gauge = gaugeState();

	<span data-gauge-note>{children}</span>
}

export function GaugeCaption({ children }) @{
	const gauge = gaugeState();
	gauge.ownText = children;

	<span data-gauge-caption>
		@if (children) {
			<>{children}</>
		} @else {
			<>none</>
		}
	</span>
}
`;

async function compiled() {
	const result = await compileTsrxModule({ filename: 'src/gauge.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result;
}

const OWN_CHILDREN = { graphNodeId: 'prop:props', path: ['children'] };

test('the plain projection leaves as an element-bound update on the part own children', async () => {
	const { protocolView } = await compiled();

	expect(protocolView.domUpdates).toMatchObject([
		{ ...OWN_CHILDREN, source: 'children', target: { kind: 'text' } },
	]);
});

test('the arm projection leaves as a branch content read on the same prop', async () => {
	const { protocolView } = await compiled();
	const [branch] = protocolView.branches ?? [];

	expect(branch?.testReads).toMatchObject([{ ...OWN_CHILDREN, source: 'children' }]);
	expect(branch?.contentReads).toMatchObject([{ ...OWN_CHILDREN, source: 'children' }]);
	expect(branch?.symbolId).toBeTruthy();
});

// The arm's text comes from the symbol's OWN read rather than from the record the
// composition rewrote, so a part composed into a page reads the prop value it
// mounted with unless that read is routed too.
test('the arm update symbol builds its html from the child-local prop id', async () => {
	const { symbolModules, protocolView } = await compiled();
	const branchSymbolId = (protocolView.branches ?? [])[0]?.symbolId;
	const armUpdate = symbolModules.modules.find((module) => module.symbolId === branchSymbolId);

	expect(armUpdate?.kind).toBe('branch-update');
	expect(armUpdate?.source).toContain('"graphNodeId": "prop:props"');
	expect(armUpdate?.source).toContain(
		'context.graph.read(part.read.graphNodeId, part.read.path)',
	);
});

// The seed reads the same prop, which is what puts the family cell and the part's
// own projection on two different roads out of one written value.
test('the shared seed reads the part own children', async () => {
	const { symbolModules } = await compiled();
	const seed = symbolModules.modules.find((module) => module.kind === 'shared-seed');

	expect(seed?.source).toContain('context.graph.read("prop:props", ["children"])');
});
