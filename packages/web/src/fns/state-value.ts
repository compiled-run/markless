import {
	marklessSetStatePayloadValue,
	type MarklessStatePayloadDraft,
} from './state-payload.ts';

// arguments.length distinguishes a read from a write of undefined, so the
// value parameter stays optional.
export function marklessStateValue(
	values: Map<string, unknown>,
	state: MarklessStatePayloadDraft,
	graphNodeId: string,
	value?: unknown,
) {
	if (arguments.length > 3) {
		values.set(graphNodeId, value);
		marklessSetStatePayloadValue(state, graphNodeId, value);
		return value;
	}
	return values.get(graphNodeId);
}
