import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	createProtocolViewPayload,
	createRenderData,
	lowerStateAccess,
	planPayloadArena,
	planSymbolResolver,
} from '../src/index.ts';

// An ancestor and a descendant both carrying a handler for the SAME event is
// ordinary DOM: the browser runs both listeners on one bubble path. The
// compiler's job is to emit one event record per element, each addressing its
// own host node and its own symbol. This pins that emission, because the
// measured silent-dispatch failure (only the innermost handler ever runs) has
// been attributed to record emission before and is not emission's fault.
const bubblePathSource = `
import { state } from '@markless/core';

export function App() @{
	let outer = state(0);
	let inner = state(0);

	<section>
		<div onKeydown={() => outer++}>
			<div onKeydown={() => inner++}>
				<output>{inner}</output>
			</div>
			<output>{outer}</output>
		</div>
	</section>
}
`;

// The second handler on ONE element: a part that already carried a click and
// then gained a keydown beside it. Both must reach the payload as records on the
// same host node, or the added handler is silently inert.
const twoHandlersOneElementSource = `
import { state } from '@markless/core';

export function App() @{
	let clicks = state(0);
	let keys = state(0);

	<section>
		<div onClick={() => clicks++} onKeydown={() => keys++}>
			<output>{clicks}</output>
			<output>{keys}</output>
		</div>
	</section>
}
`;

async function viewFor(filename: string, source: string) {
	const semanticGraph = await buildSemanticGraph({ filename, source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	return createProtocolViewPayload({
		payloadArena,
		symbolResolver,
		renderData: createRenderData({ semanticGraph, symbolResolver }),
		publicRenderPlan: {
			asyncBoundaryGates: payloadArena.view.asyncBoundaries.map((boundary) => ({
				boundaryId: boundary.id,
				supported: true as const,
			})),
			branchReactivityGates: [],
			keyedRepeats: [],
		} as never,
	});
}

test('an ancestor and a descendant handler for one event become two distinct records', async () => {
	const view = await viewFor('src/BubblePath.tsrx', bubblePathSource);
	const keydowns = view.events.filter((event) => event.eventName === 'keydown');

	// Two records, on two different host nodes, each with its own symbol.
	expect(keydowns.length).toBe(2);
	expect(new Set(keydowns.map((event) => event.hostNodeId)).size).toBe(2);
	expect(new Set(keydowns.flatMap((event) => event.symbolIds)).size).toBe(2);
});

test('two handlers on one element become one record per event name', async () => {
	const view = await viewFor('src/TwoHandlers.tsrx', twoHandlersOneElementSource);
	const named = view.events.filter(
		(event) => event.eventName === 'click' || event.eventName === 'keydown',
	);

	expect(named.map((event) => event.eventName).sort()).toEqual(['click', 'keydown']);
	// Both records address the SAME element: one host node carries both handlers.
	expect(new Set(named.map((event) => event.hostNodeId)).size).toBe(1);
	expect(new Set(named.flatMap((event) => event.symbolIds)).size).toBe(2);
});
