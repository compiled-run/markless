import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';

// The client graph stores an async computed as its snapshot, so a repeat over the
// bare computed must read the snapshot's resolved value, not the snapshot itself.
async function repeatCollections(source: string) {
	const semanticGraph = await buildSemanticGraph({ filename: 'src/App.tsrx', source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	return (payloadArena.view.keyedRepeats ?? []).map((repeat) => [
		repeat.collectionGraphNodeId,
		repeat.collectionPath,
	]);
}

test('a repeat over a bare async computed reads its resolved value', async () => {
	expect(
		await repeatCollections(`import { computed } from '@markless/core';
export function Tray() @{
	const parcels = computed(async () => [{ code: 'p' }]);
	<ol>@try { @for (const parcel of parcels; key parcel.code) { <li>{parcel.code}</li> } } @pending { <li>wait</li> }</ol>
}
`),
	).toEqual([['computed:parcels', ['value']]]);
});

test('a nested repeat under a bare async computed chains from its resolved value', async () => {
	expect(
		await repeatCollections(`import { computed } from '@markless/core';
export function Wall() @{
	const racks = computed(async () => [{ tag: 'r', bins: [{ slot: 1 }] }]);
	<div>@try { @for (const rack of racks; key rack.tag) { <ul>@for (const bin of rack.bins; key bin.slot) { <li>{bin.slot}</li> }</ul> } } @pending { <p>wait</p> }</div>
}
`),
	).toEqual([
		['computed:racks', ['value']],
		['computed:racks', ['value', '*', 'bins']],
	]);
});

test('member and sync collections keep their authored path', async () => {
	expect(
		await repeatCollections(`import { computed, state } from '@markless/core';
export function Desk() @{
	let notes = state([{ id: 'n' }]);
	const board = computed(async () => ({ pins: [{ id: 'q' }] }));
	<main>
		<ul>@for (const note of notes; key note.id) { <li>{note.id}</li> }</ul>
		@try { <ul>@for (const pin of board.pins; key pin.id) { <li>{pin.id}</li> }</ul> } @pending { <p>wait</p> }
	</main>
}
`),
	).toEqual([
		['state:notes', []],
		['computed:board', ['pins']],
	]);
});
