import { marklessSetStatePayloadValue } from './state-payload.ts';

export function marklessStateValue(values, state, graphNodeId, value) {
	if (arguments.length > 3) {
		values.set(graphNodeId, value);
		marklessSetStatePayloadValue(state, graphNodeId, value);
		return value;
	}
	return values.get(graphNodeId);
}
