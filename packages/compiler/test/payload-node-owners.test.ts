import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import type { PublicRenderModuleInput } from '../src/artifacts.ts';
import { componentOwnedStateNodes } from '../src/passes/public-render/shared.ts';

const filename = 'src/Accordion.tsrx';

// Three components declaring one computed name, the accordion Item/Trigger/Content shape.
const source = `
import { computed, state } from '@markless/core';

function AccordionItem({ open }) @{
	const isOpen = computed(() => open === true);
	<div class={isOpen ? 'item open' : 'item'}>Item</div>
}

function AccordionTrigger({ open }) @{
	const isOpen = computed(() => open === true);
	<button aria-expanded={isOpen}>Trigger</button>
}

function AccordionContent({ open }) @{
	const isOpen = computed(() => open === true);
	<section hidden={isOpen}>Content</section>
}

export function App() @{
	let open = state(false);
	<>
		<AccordionItem open={open} />
		<AccordionTrigger open={open} />
		<AccordionContent open={open} />
	</>
}
`;

async function accordionRenderInput(): Promise<PublicRenderModuleInput> {
	const compiled = await compileTsrxModule({ filename, source, symbols: [] });
	return {
		source: { filename, source },
		semanticGraph: compiled.semanticGraph,
		renderData: compiled.renderData,
		publicRenderPlan: compiled.publicRenderPlan,
		symbolResolver: compiled.symbolResolver,
		captureAnalysis: compiled.captureAnalysis,
		protocolState: compiled.protocolState,
		protocolView: compiled.protocolView,
	};
}

function computedOwners(input: PublicRenderModuleInput): Record<string, ReadonlyArray<number>> {
	return Object.fromEntries(
		['AccordionItem', 'AccordionTrigger', 'AccordionContent'].map((componentName) => [
			componentName,
			componentOwnedStateNodes(input, componentName, 'App').computedIndexes,
		]),
	);
}

test('same-module components declaring one computed name each own their own record', async () => {
	const input = await accordionRenderInput();

	expect(input.protocolState.computed.map((computed) => computed.graphNodeId)).toEqual([
		'computed:AccordionItem.isOpen',
		'computed:AccordionTrigger.isOpen',
		'computed:AccordionContent.isOpen',
	]);
	expect(computedOwners(input)).toEqual({
		AccordionItem: [0],
		AccordionTrigger: [1],
		AccordionContent: [2],
	});
});

// Pins the cells and the computed resolving duplicate ids independently: a cell
// spelling an id the computed also spell must not consume the declarations the
// computed pass still needs. One shared queue drained across both passes hands
// every computed record to the wrong component.
test('a cell spelling a shared computed id does not steal the computed records', async () => {
	const input = await accordionRenderInput();
	const servedComputedCell = {
		...input.protocolState.cells[0]!,
		graphNodeId: 'computed:AccordionItem.isOpen',
		name: 'isOpen',
	};
	const spliced: PublicRenderModuleInput = {
		...input,
		protocolState: {
			...input.protocolState,
			cells: [...input.protocolState.cells, servedComputedCell],
		},
	};

	expect(computedOwners(spliced)).toEqual({
		AccordionItem: [0],
		AccordionTrigger: [1],
		AccordionContent: [2],
	});
});
