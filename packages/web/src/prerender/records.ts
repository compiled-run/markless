import {
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_CONTAINER_HOST_NODE_ID,
	serializeRuntimeAsyncSnapshots,
	serializeRuntimeStateCells,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@markless/serializer';
import type { SsrRenderOutput } from '../render-to-string.ts';

export async function prepareSsrResumeRecords(
	output: SsrRenderOutput,
): Promise<{ readonly state: ProtocolStatePayload; readonly view: ProtocolViewPayload }> {
	const rawState = output.state ?? emptyStatePayload();
	const state = {
		...rawState,
		cells: serializeRuntimeStateCells(rawState.cells ?? []),
		computed: serializeRuntimeAsyncSnapshots(rawState.computed ?? []),
	};
	const view = containerScopedView(output.view ?? emptyViewPayload());
	if (view.keyedRepeats?.length)
		await (
			await import('../repeat-runtime.ts')
		).validateKeyedRepeatPayloadKeys({ state, view });
	return { state, view };
}

function containerScopedView(view: ProtocolViewPayload): ProtocolViewPayload {
	const locators = view.locators.map((locator) => ({
		...locator,
		index: locator.index + 1,
	}));
	// Index 0 is the container itself, the parent of rows written at the page's top level.
	if (
		view.keyedRepeats?.some(
			(repeat) => repeat.parentHostNodeId === PROTOCOL_CONTAINER_HOST_NODE_ID,
		)
	)
		locators.unshift({
			hostNodeId: PROTOCOL_CONTAINER_HOST_NODE_ID,
			strategy: 'dom-order',
			index: 0,
			tagName: '*',
		});
	return { ...view, locators };
}

function emptyStatePayload(): ProtocolStatePayload {
	return { version: ASYNC_PROTOCOL_VERSION, cells: [], computed: [] };
}

function emptyViewPayload(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}
