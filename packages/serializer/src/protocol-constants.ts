export const ASYNC_PROTOCOL_VERSION = 1;
export const STORAGE_PROTOCOL_VERSION = 2;

// One rule for "which state protocol version does this payload speak": the
// storage records and the version stamp must be decided together, or the
// client's storage validator rejects a version-2 payload with no array.
export function protocolStateVersion(
	storage: readonly unknown[] | undefined,
): typeof ASYNC_PROTOCOL_VERSION | typeof STORAGE_PROTOCOL_VERSION {
	return (storage?.length ?? 0) > 0 ? STORAGE_PROTOCOL_VERSION : ASYNC_PROTOCOL_VERSION;
}

export const ASYNC_BOUNDARY_ARM_MIN = 0;
export const ASYNC_BOUNDARY_ARM_PENDING = 1;
export const ASYNC_BOUNDARY_ARM_MAX = 2;

// Instance identity grammar: composition qualifies a composed child's graph
// node, symbol, and host node ids with one segment per component edge it was
// composed through, outermost first. `c<n>:` is a module's own edge, `p<n>:` a
// child the template projected into a component: `<Root><Trigger/></Root>` mints
// `c0:` and `c0:p1:`, disjoint from Root's own `c0:c1:`. Both index the
// compiler's edge, not render order, so a sibling above renumbers nothing.
// `r:<key>:` is a third, RUNTIME segment kind: one keyed `@for` row, so each
// iteration of a compile-time edge is its own instance. Encoding escapes `:`.
const PROTOCOL_INSTANCE_PATH = /^(?:[cp]\d+:|r:[^:]*:)+/;

export function protocolInstanceSegment(edgeIndex: number): string {
	return `c${edgeIndex}:`;
}

export function protocolProjectionSegment(edgeIndex: number): string {
	return `p${edgeIndex}:`;
}

/** One keyed `@for` row's identity segment. The key is identity, never the index. */
export function protocolRowSegment(key: unknown): string {
	return `r:${encodeURIComponent(String(key))}:`;
}

/** The leading instance path of a composed id, or '' when the id is page-local. */
export function protocolInstancePath(id: string): string {
	return PROTOCOL_INSTANCE_PATH.exec(id)?.[0] ?? '';
}

export const PROTOCOL_PROPS_GRAPH_NODE_ID = 'prop:props';
export const PROTOCOL_PROP_GRAPH_NODE_PREFIX = 'prop:';

// Compiler-synthesized graph node id families. Composition classifies every
// child node id against these; an unknown family answers `undefined` so the
// caller refuses instead of merging a silently unqualified node.
const PROTOCOL_INSTANCE_QUALIFIABLE = ['prop:', 'state:', 'computed:', 'element:'];

// Families whose ids already name one module-qualified definition (a shared()
// graph, a persisted storage slot). Every instance of a component means the
// same node, so composition must leave these ids alone.
export const PROTOCOL_PAGE_SPACE_ID_PREFIXES = ['shared:', 'storage:'];

export function protocolInstanceQualifies(graphNodeId: string): boolean | undefined {
	const local = graphNodeId.slice(protocolInstancePath(graphNodeId).length);
	if (PROTOCOL_PAGE_SPACE_ID_PREFIXES.some((prefix) => local.startsWith(prefix))) return false;
	return PROTOCOL_INSTANCE_QUALIFIABLE.some((prefix) => local.startsWith(prefix))
		? true
		: undefined;
}
