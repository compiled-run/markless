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

// A joined text derive is read by a DOM update rather than a chunk slot, so its
// record belongs to the component rendering the text; filed under the root, a
// child instance's update subscribed to a derive nothing ever ran.
test('a joined text derive is owned by the component that renders it', async () => {
	const joined = `
import { computed, state } from '@markless/core';

function Chip() @{
	let hits = state(0);
	const twice = computed(() => hits * 2);
	<i onClick={() => hits++}>chip {hits}/{twice}</i>
}

export function App() @{
	let count = state(0);
	<main><p>{count} of {count}</p><Chip /><button onClick={() => count++}>go</button></main>
}
`;
	const compiled = await compileTsrxModule({ filename, source: joined, symbols: [] });
	const input: PublicRenderModuleInput = {
		source: { filename, source: joined },
		semanticGraph: compiled.semanticGraph,
		renderData: compiled.renderData,
		publicRenderPlan: compiled.publicRenderPlan,
		symbolResolver: compiled.symbolResolver,
		captureAnalysis: compiled.captureAnalysis,
		protocolState: compiled.protocolState,
		protocolView: compiled.protocolView,
	};
	const owned = (componentName: string) =>
		componentOwnedStateNodes(input, componentName, 'App').computedIndexes.map(
			(index) => input.protocolState.computed[index]!.graphNodeId,
		);

	expect(owned('Chip')).toEqual(['computed:twice', 'computed:templateExpression:0']);
	expect(owned('App')).toEqual(['computed:templateExpression:1']);
});
