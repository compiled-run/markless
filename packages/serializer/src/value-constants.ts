import type { SerializedGraphPayload } from './value.ts';

export const GRAPH_VALUE_PROTOCOL_VERSION = 1;

// Browser-side linked render data creates only a pending/null snapshot before
// the demanded graph exists. Keep that protocol value here so the evaluator
// does not pull the general graph serializer into every emitted client build.
export const SERIALIZED_NULL_GRAPH_PAYLOAD: SerializedGraphPayload = {
	version: GRAPH_VALUE_PROTOCOL_VERSION,
	root: null,
	records: [],
};
