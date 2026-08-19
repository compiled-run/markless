import { protocolInstanceSegment, protocolProjectionSegment } from '@markless/serializer';
import type {
	ArtifactChildMaterialization,
	BoundSymbolResolverArtifact,
	SemanticComponentEdge,
} from './artifacts.ts';

export const COMPONENT_EDGE_ID_PREFIX = 'component-edge:';

/** Every component edge of one module, keyed by edge id, spelling its module-root instance path. */
export type ComponentEdgeInstancePaths = ReadonlyMap<string, string>;

// Edge ids are numbered by the module that declares them; the list position is
// the same number, and answers for any id the compiler did not mint itself.
function componentEdgeIndex(
	edge: SemanticComponentEdge,
	edges: ReadonlyArray<SemanticComponentEdge>,
): number {
	const index = Number(edge.id.slice(COMPONENT_EDGE_ID_PREFIX.length));
	return Number.isInteger(index) ? index : edges.indexOf(edge);
}

// A component written inside another component's tag is PROJECTED: the parent
// places it into that component's children, so its instance lives under the
// component it was projected into. The projected segment kind keeps it disjoint
// from that component's own edges, which are numbered in the child module.
function projectionParentId(
	edge: SemanticComponentEdge,
	edges: ReadonlyArray<SemanticComponentEdge>,
): string | undefined {
	const span = edge.sourceSpan;
	if (!span) return undefined;
	let parent: SemanticComponentEdge | undefined;
	for (const candidate of edges) {
		const candidateSpan = candidate.sourceSpan;
		if (candidate.id === edge.id || !candidateSpan) continue;
		if (candidateSpan.start >= span.start || candidateSpan.end <= span.end) continue;
		if (!parent || candidateSpan.start > parent.sourceSpan!.start) parent = candidate;
	}
	return parent?.id;
}

/**
 * The instance path each component edge of a module contributes, outermost
 * segment first. Every edge contributes one segment; a projected edge is
 * additionally prefixed with the path of the component it was projected into.
 */
export function componentEdgeInstancePaths(
	edges: ReadonlyArray<SemanticComponentEdge>,
): ComponentEdgeInstancePaths {
	const paths = new Map<string, string>();
	const resolve = (edge: SemanticComponentEdge, seen: ReadonlySet<string>): string => {
		const cached = paths.get(edge.id);
		if (cached !== undefined) return cached;
		const parentId = seen.has(edge.id) ? undefined : projectionParentId(edge, edges);
		const parent = parentId ? edges.find((candidate) => candidate.id === parentId) : undefined;
		const path = parent
			? resolve(parent, new Set(seen).add(edge.id)) +
				protocolProjectionSegment(componentEdgeIndex(edge, edges))
			: protocolInstanceSegment(componentEdgeIndex(edge, edges));
		paths.set(edge.id, path);
		return path;
	};
	for (const edge of edges) resolve(edge, new Set());
	return paths;
}

// A projection parent always sits in the same component template as the edge it
// encloses, so any edge list that keeps a whole template together answers the
// same paths. Cached per list so repeated emission stays linear.
const pathsByEdgeList = new WeakMap<object, ComponentEdgeInstancePaths>();

function instancePathsFor(
	edges: ReadonlyArray<SemanticComponentEdge>,
): ComponentEdgeInstancePaths {
	const cached = pathsByEdgeList.get(edges);
	if (cached) return cached;
	const paths = componentEdgeInstancePaths(edges);
	pathsByEdgeList.set(edges, paths);
	return paths;
}

// A composed child's instance path, as the module that composes it spells it.
// Same-module children carry it too: their symbols route back to the composing
// module's own resolver after the prefix is stripped.
export function componentEdgeInstanceSegment(
	edge: SemanticComponentEdge | undefined,
	edges: ReadonlyArray<SemanticComponentEdge>,
): string {
	if (!edge) return '';
	return instancePathsFor(edges).get(edge.id) ?? protocolInstanceSegment(componentEdgeIndex(edge, edges));
}

// The path of a component-edge chain, outermost segment first. Each edge
// contributes the path its OWN module spells, so the chain concatenates across
// module boundaries exactly as composition does at render time.
export function componentEdgeInstancePath(
	chain: ReadonlyArray<SemanticComponentEdge>,
	edges: ReadonlyArray<SemanticComponentEdge>,
): string {
	return chain.map((edge) => componentEdgeInstanceSegment(edge, edges)).join('');
}

/**
 * One symbol route: the instance prefix a child's symbol ids carry, and where
 * they are answered. A route either names the child module to import, or is a
 * `self` route whose symbols this module emitted itself.
 */
export type ComponentEdgeSymbolRoute = {
	readonly prefix: string;
	readonly componentEdgeId: string;
} & ({ readonly importSource: string } | { readonly self: true });

// One symbol route per composed component edge, keyed by the FULL instance path
// the compiler spelled for that edge. A projected child nests under the
// component it was projected into (`c0:p1:`), so its route must be tried before
// that component's own (`c0:`) — hence longest prefix first.
export function componentEdgeSymbolRoutes(
	compiled: {
		readonly semanticGraph: { readonly componentEdges: ReadonlyArray<SemanticComponentEdge> };
		readonly boundSymbolResolver: Pick<
			BoundSymbolResolverArtifact,
			'componentEdgeInstancePaths'
		>;
	},
	artifactChildMaterializations:
		| Readonly<Record<string, ArtifactChildMaterialization>>
		| undefined,
): ComponentEdgeSymbolRoute[] {
	const instancePaths = new Map(
		(compiled.boundSymbolResolver.componentEdgeInstancePaths ?? []).map((entry) => [
			entry.componentEdgeId,
			entry.instancePath,
		]),
	);
	return compiled.semanticGraph.componentEdges
		.flatMap((edge, index): ComponentEdgeSymbolRoute[] => {
			if (artifactChildMaterializations?.[edge.id]) return [];
			const prefix = instancePaths.get(edge.id) ?? protocolInstanceSegment(index);
			// A same-module child's symbols were emitted by THIS module, so its
			// route strips the instance path and answers from the page's own
			// resolver. It never names an import, so it never reaches the
			// manifest's import resolution.
			return [
				edge.importSource
					? { prefix, importSource: edge.importSource, componentEdgeId: edge.id }
					: { prefix, self: true, componentEdgeId: edge.id },
			];
		})
		.sort((left, right) => right.prefix.length - left.prefix.length);
}

// Only routes that name a child module belong in the manifest: the manifest's
// consumers resolve every entry to an import source.
export function importedSymbolRoutes(
	routes: ReadonlyArray<{
		readonly prefix: string;
		readonly componentEdgeId?: string;
		readonly importSource?: string;
	}>,
): Array<{
	readonly prefix: string;
	readonly importSource: string;
	readonly componentEdgeId?: string;
}> {
	return routes.flatMap((route) =>
		'importSource' in route && route.importSource !== undefined
			? [{ ...route, importSource: route.importSource }]
			: [],
	);
}
