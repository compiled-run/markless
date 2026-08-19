import { protocolInstanceSegment } from '@markless/serializer';
import type { SemanticComponentEdge } from './artifacts.ts';

export const COMPONENT_EDGE_ID_PREFIX = 'component-edge:';

// A composed child's instance path segment. Only children whose symbols route
// through their own module carry the segment in their symbol ids, so only they
// can have their graph node ids qualified and re-scoped at resume.
export function componentEdgeInstanceSegment(edge: SemanticComponentEdge | undefined): string {
	if (!edge?.importSource) return '';
	const index = Number(edge.id.slice(COMPONENT_EDGE_ID_PREFIX.length));
	if (!Number.isInteger(index)) {
		throw new Error(`MARKLESS_COMPONENT_EDGE_ID_UNPARSED: ${edge.id}`);
	}
	return protocolInstanceSegment(index);
}

// The path of a component-edge chain, outermost segment first.
export function componentEdgeInstancePath(
	edges: ReadonlyArray<SemanticComponentEdge>,
): string {
	return edges.map((edge) => componentEdgeInstanceSegment(edge)).join('');
}
