import { serializeGraphValue } from '@markless/serializer';
import { marklessSerializeGraphValue } from './state-serialize.ts';

// The served state payload while it is still being built: cells carry the
// encoded value the render writes back into.
export type MarklessStatePayloadDraft = {
	readonly cells?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly name?: string;
		value?: unknown;
	}>;
};

export function marklessSetStatePayloadValue(
	state: MarklessStatePayloadDraft,
	graphNodeId: string,
	value: unknown,
) {
	const cell = state.cells?.find((candidate) => candidate.graphNodeId === graphNodeId);
	if (cell) cell.value = marklessSerializeGraphValue(value, cell);
}

export type MarklessComputedPayloadDraft = {
	computed?: Array<{
		readonly graphNodeId: string;
		readonly name?: string;
		readonly value?: unknown;
	}>;
};

// `marklessCloneState` copies the computed ARRAY but not the records in it, so a
// served value replaces its record rather than mutating one the module still shares.
// A value in `ifDurable` the serializer refuses stays unserved; resume derives it instead.
export function marklessSsrServeComputed(
	state: MarklessComputedPayloadDraft,
	values: ReadonlyMap<string, unknown>,
	graphNodeIds: ReadonlyArray<string>,
	ifDurable: ReadonlyArray<string> = [],
) {
	const computed = state.computed;
	if (!computed) return;
	for (const graphNodeId of graphNodeIds) {
		if (!values.has(graphNodeId)) continue;
		const index = computed.findIndex((record) => record.graphNodeId === graphNodeId);
		const record = index < 0 ? undefined : computed[index];
		if (!record) continue;
		const value = values.get(graphNodeId);
		if (ifDurable.includes(graphNodeId)) {
			const result = serializeGraphValue(value);
			if (result.ok) computed[index] = { ...record, value: result.payload };
			continue;
		}
		computed[index] = { ...record, value: marklessSerializeGraphValue(value, record) };
	}
}
