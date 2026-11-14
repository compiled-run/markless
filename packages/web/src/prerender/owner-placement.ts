import type { RuntimeGraph } from '@markless/runtime';
import {
	marklessInstanceSegments,
	marklessRowFreeSymbolId,
	type MarklessScopedGraph,
} from '../fns/instance-scope.ts';

type PlacementEdge = {
	readonly id: string;
	readonly symbolPrefix: string;
	readonly boundSymbols?: Readonly<Record<string, string>>;
};

type PlacementSurface = {
	readonly components: Readonly<
		Record<
			string,
			{
				readonly edges?: ReadonlyArray<PlacementEdge>;
				readonly placements?: ReadonlyArray<ReadonlyArray<OwnerPlacementStep>>;
			}
		>
	>;
};

// One edge of a chain the compiler found from a component nothing in the module places down to the owner.
type OwnerPlacementStep = { readonly edgeId: string; readonly rows?: number };

export type BranchOwnerPlacement = {
	// The page path of the module root the owner was composed under.
	readonly moduleRootPath: string;
	// The owner's path from that module root, rows included.
	readonly ownerPath: string;
	// The edges from the module root down to the owner, root first, and the path from the root each one places at.
	readonly above?: ReadonlyArray<{ readonly edge: PlacementEdge; readonly path: string }>;
};

// The flip's graph stands at the owner's page path; the owner's own placements in its module say which tail of it is the module's.
export function branchOwnerPlacement(
	surface: PlacementSurface,
	ownerName: string | undefined,
	graph: RuntimeGraph,
): BranchOwnerPlacement | undefined {
	const pagePath = (graph as MarklessScopedGraph).marklessInstancePath;
	if (!ownerName || !pagePath) return undefined;
	const segments = marklessInstanceSegments(pagePath);
	const edges = new Map<string, PlacementEdge>();
	for (const component of Object.values(surface.components))
		for (const edge of component.edges ?? []) edges.set(edge.id, edge);
	for (let start = 0; start < segments.length; start++)
		for (const chain of surface.components[ownerName]?.placements ?? []) {
			const above = placedAlong(chain, edges, segments, start);
			if (above)
				return {
					moduleRootPath: segments.slice(0, start).join(''),
					ownerPath: above.at(-1)!.path,
					above,
				};
		}
	// An owner none of its module's components places was composed from another module, at that module's root.
	return { moduleRootPath: pagePath, ownerPath: '' };
}

// The chain spells the page path from `start` to its end exactly: each edge's rows, then its own segment.
function placedAlong(
	chain: ReadonlyArray<OwnerPlacementStep>,
	edges: ReadonlyMap<string, PlacementEdge>,
	segments: ReadonlyArray<string>,
	start: number,
): BranchOwnerPlacement['above'] {
	const above: Array<{ edge: PlacementEdge; path: string }> = [];
	let at = start;
	let path = '';
	for (const step of chain) {
		const edge = edges.get(step.edgeId);
		if (!edge) return undefined;
		for (let row = 0; row < (step.rows ?? 0); row++, at++) {
			const segment = segments[at];
			if (segment === undefined || marklessRowFreeSymbolId(segment, segment) !== '') return undefined;
			path += segment;
		}
		const own = marklessInstanceSegments(edge.symbolPrefix).length;
		if (segments.slice(at, at + own).join('') !== edge.symbolPrefix) return undefined;
		path += edge.symbolPrefix;
		at += own;
		above.push({ edge, path });
	}
	return at === segments.length ? above : undefined;
}
