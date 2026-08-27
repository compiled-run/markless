import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../../src/index.ts';

// An element() handle bound inside a flippable @if arm. The binding itself
// leaves no markup slot, so the flip machinery already carries it: the arm's
// record files the handle when the arm renders and the runtime unfiles it when
// the arm goes away. What a flip cannot answer is the id an IDREF elsewhere
// makes the bound element carry, because that id is minted per rendered widget.

const family = `
import { element, shared, state } from '@markless/core';

export const widgetState = shared(
	() => {
		const widget = state({ open: false });
		const panelEl = element<HTMLDivElement>();

		return { ...widget, panelEl };
	},
	{ scope: 'widget' },
);
`;

const boundInArm = `${family}
export function Widget() @{
	const widget = widgetState();

	<div data-widget>
		<button type="button" onClick={() => { widget.open = !widget.open; }}>toggle</button>
		@if (widget.open) {
			<div data-panel el={widget.panelEl}>panel body</div>
		}
	</div>
}
`;

const namedByIdref = `${family}
export function Widget() @{
	const widget = widgetState();

	<div data-widget aria-controls={widget.panelEl}>
		<button type="button" onClick={() => { widget.open = !widget.open; }}>toggle</button>
		@if (widget.open) {
			<div data-panel el={widget.panelEl}>panel body</div>
		}
	</div>
}
`;

const boundInBothArms = `${family}
export function Widget() @{
	const widget = widgetState();

	<div data-widget>
		<button type="button" onClick={() => { widget.open = !widget.open; }}>toggle</button>
		@if (widget.open) {
			<div data-panel data-arm="open" el={widget.panelEl}>open body</div>
		} @else {
			<div data-panel data-arm="closed" el={widget.panelEl}>closed body</div>
		}
	</div>
}
`;

test('a handle bound inside a flippable arm compiles, and the arm record carries it', async () => {
	const result = await compileTsrxModule({
		filename: 'src/HandleInArm.tsrx',
		source: boundInArm,
		symbols: [],
	});
	expect(result.symbolModules.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);

	const branch = result.protocolView.branches?.[0];
	expect(branch?.symbolId, 'the branch ships a flip module').toBeDefined();
	const arm = branch?.armRecords?.[0];
	expect(arm?.elementHandles.map((handle) => handle.name)).toEqual(['panelEl']);
});

test('an IDREF naming a handle bound inside the arm refuses, and says the id is what a flip cannot respell', async () => {
	const result = await compileTsrxModule({
		filename: 'src/NamedByIdref.tsrx',
		source: namedByIdref,
		symbols: [],
	});
	const refusal = result.symbolModules.diagnostics.find(
		(entry) => entry.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
	);
	expect(refusal?.severity).toBe('error');
	// Not "it holds a attribute binding": the cause is the minted id, and naming
	// the slot kind instead sent a reader looking for a binding that is not there.
	expect(refusal?.message).toContain('named by an IDREF');
	expect(refusal?.message).toContain('minted for the rendered widget');
});

test('one handle bound in both arms of a branch is still a duplicate', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/BoundInBothArms.tsrx',
		source: boundInBothArms,
	});
	const duplicate = graph.diagnostics.find(
		(entry) => entry.code === 'MARKLESS_ELEMENT_HANDLE_DUPLICATE',
	);
	expect(duplicate?.severity).toBe('error');
	expect(duplicate?.message).toContain('panelEl');
});
