import { marklessSerializeGraphValue } from './state-serialize.ts';

// The served state payload while it is still being built: cells carry the
// encoded value the render writes back into.
export type MarklessStatePayloadDraft = {
	readonly cells?: ReadonlyArray<{ readonly graphNodeId: string; value?: unknown }>;
};

export function marklessSetStatePayloadValue(
	state: MarklessStatePayloadDraft,
	graphNodeId: string,
	value: unknown,
) {
	const cell = state.cells?.find((candidate) => candidate.graphNodeId === graphNodeId);
	if (cell) cell.value = marklessSerializeGraphValue(value);
}
