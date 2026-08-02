import {
	ASYNC_PROTOCOL_VERSION,
	serializeRuntimeAsyncSnapshots,
	serializeRuntimeStateCells,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@markless/serializer';
import { validateKeyedRepeatPayloadKeys } from '../repeat-runtime.ts';
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
	await validateKeyedRepeatPayloadKeys({ state, view });
	return { state, view };
}

function containerScopedView(view: ProtocolViewPayload): ProtocolViewPayload {
	return {
		...view,
		locators: view.locators.map((locator) => ({
			...locator,
			index: locator.index + 1,
		})),
	};
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
