import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	createProtocolStatePayloadFromArena,
	lowerStateAccess,
	planPayloadArena,
	planSymbolResolver,
} from '../src/index.ts';

// A widget family whose root seeds its instance from its own props: the shape
// every composed family has, and the one a composing parent's write has to reach.
const familySource = `
import { shared, state } from '@markless/core';

export const boxState = shared(() => {
	const box = state({ ticked: false, locked: false, tag: '' });

	return {
		...box,
		flip() { box.ticked = !box.ticked; },
	};
}, { scope: 'widget' });

export function BoxRoot({ ticked = false, locked = false, children }) @{
	const box = boxState();
	box.ticked = ticked;
	box.locked = locked;
	// Not a prop read: nothing outside this component can move it.
	box.tag = 'box';

	<div ui-ticked={box.ticked}>{children}</div>
}
`;

async function statePayload(filename: string, source: string) {
	const semanticGraph = await buildSemanticGraph({ filename, source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });
	return {
		state: createProtocolStatePayloadFromArena({ semanticGraph, payloadArena, symbolResolver }),
		symbolResolver,
	};
}

test('a shared seed read from props declares the prop reads its node follows', async () => {
	const { state, symbolResolver } = await statePayload('src/box.tsrx', familySource);
	const node = 'shared:src/box.tsrx#boxState/state:box';
	const seeds = (state.sharedSeeds ?? []).filter((seed) => seed.graphNodeId === node);

	// Before composition the route and the read the seed makes are one and the
	// same; composition is what moves the route onto the parent's node.
	expect(seeds.map((seed) => seed.dependencies)).toEqual([
		[
			{
				graphNodeId: 'prop:props',
				path: ['ticked'],
				reads: { graphNodeId: 'prop:props', path: ['ticked'] },
			},
		],
		[
			{
				graphNodeId: 'prop:props',
				path: ['locked'],
				reads: { graphNodeId: 'prop:props', path: ['locked'] },
			},
		],
	]);

	// The derive symbol is the seed's own planned symbol, so resume re-runs the
	// authored expression rather than a second lowering of it.
	for (const seed of seeds) {
		const symbol = symbolResolver.symbols.find((candidate) => candidate.id === seed.deriveSymbolId);
		expect(symbol?.kind).toBe('shared-seed');
	}
});

test('a shared seed that reads no prop declares no follow record', async () => {
	const { state, symbolResolver } = await statePayload('src/box.tsrx', familySource);
	const constantSeed = symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'shared-seed' && symbol.name === 'box.tag',
	);

	expect(constantSeed).toBeDefined();
	expect(
		(state.sharedSeeds ?? []).some((seed) => seed.deriveSymbolId === constantSeed?.id),
	).toBe(false);
});

// Hardcoding resistance: same structure, different family/prop/component names.
test('the follow records are read from structure, not from names', async () => {
	const { state } = await statePayload(
		'src/panel.tsrx',
		`
import { shared, state } from '@markless/core';

export const panelState = shared(() => {
	const panel = state({ open: false });

	return { ...panel, toggle() { panel.open = !panel.open; } };
}, { scope: 'widget' });

export function PanelSurface({ open = false, children }) @{
	const panel = panelState();
	panel.open = open;

	<section ui-open={panel.open}>{children}</section>
}
`,
	);

	expect(
		(state.sharedSeeds ?? []).map((seed) => ({
			graphNodeId: seed.graphNodeId,
			dependencies: seed.dependencies,
		})),
	).toEqual([
		{
			graphNodeId: 'shared:src/panel.tsrx#panelState/state:panel',
			dependencies: [
				{
					graphNodeId: 'prop:props',
					path: ['open'],
					reads: { graphNodeId: 'prop:props', path: ['open'] },
				},
			],
		},
	]);
});
