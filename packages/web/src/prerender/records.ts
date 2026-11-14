import {
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_CONTAINER_HOST_NODE_ID,
	serializeRuntimeAsyncSnapshots,
	serializeRuntimeStateCells,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@markless/serializer';
import type { SsrRenderOutput } from '../render-to-string.ts';
import type { ResumeArmRecordSet } from '../resume-types.ts';

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

// @try blocks inside a range, re-addressed from its start anchor so the commit can wire them.
export function boundariesInside(
	view: Pick<ProtocolViewPayload, 'asyncBoundaries'>,
	range: {
		readonly startAnchor: { readonly index: number };
		readonly endAnchor: { readonly index: number };
	},
): NonNullable<ResumeArmRecordSet['asyncBoundaries']> {
	const start = range.startAnchor.index;
	const armIndex = <A extends { readonly index: number }>(anchor: A): A => ({
		...anchor,
		index: anchor.index - start - 1,
	});
	return view.asyncBoundaries
		.filter(
			(candidate) =>
				candidate.startAnchor.index > start &&
				candidate.endAnchor.index < range.endAnchor.index,
		)
		.map(({ armRecords: served, ...candidate }) => ({
			...candidate,
			...(served && !Array.isArray(served) && { armRecords: served as ResumeArmRecordSet }),
			startAnchor: armIndex(candidate.startAnchor),
			endAnchor: armIndex(candidate.endAnchor),
		}));
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
