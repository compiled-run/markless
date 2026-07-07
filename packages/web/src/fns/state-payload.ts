import { marklessSerializeGraphValue } from './state-serialize.ts';

export function marklessSetStatePayloadValue(state, graphNodeId, value) {
	const cell = state.cells?.find((candidate) => candidate.graphNodeId === graphNodeId);
	if (cell) cell.value = marklessSerializeGraphValue(value);
}
