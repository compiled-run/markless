import type { RuntimeGraph } from '@markless/runtime';
import {
	marklessInstanceSegments,
	marklessRowFreeSymbolId,
	type MarklessScopedGraph,
} from '../fns/instance-scope.ts';

// One edge of a chain the compiler found from a component nothing in the module places down to the owner.
export type OwnerPlacementStep = { readonly edgeId: string; readonly prefix: string; readonly rows?: number };

type PlacementSurface = {
	readonly components: Readonly<
		Record<string, { readonly placements?: ReadonlyArray<ReadonlyArray<OwnerPlacementStep>> }>
	>;
};

export type BranchOwnerPlacement = {
	// The page path of the module root the owner was composed under.
	readonly moduleRootPath: string;
	// The owner's path from that module root, rows included.
	readonly ownerPath: string;
	// The same-file edges from the module root down to the owner, when the owner's own file placed it.
	readonly chain?: ReadonlyArray<OwnerPlacementStep>;
};

// The flip's graph stands at the owner's page path; the chains that place the owner in its file say which tail of it is the file's.
export function branchOwnerPlacement(
	surface: PlacementSurface,
	ownerName: string | undefined,
	graph: RuntimeGraph,
): BranchOwnerPlacement | undefined {
	const pagePath = (graph as MarklessScopedGraph).marklessInstancePath;
	if (!ownerName || !pagePath) return undefined;
	const segments = marklessInstanceSegments(pagePath);
	for (const chain of surface.components[ownerName]?.placements ?? []) {
		let at = segments.length;
		// Each edge spells its own segments, after the rows of the @for it sits in.
		for (let step = chain.length; step-- > 0 && at >= 0; ) {
			const { prefix, rows = 0 } = chain[step]!;
			const own = marklessInstanceSegments(prefix).length;
			at = at >= own && segments.slice(at - own, at).join('') === prefix ? at - own : -1;
			for (let row = 0; row < rows && at >= 0; row++) {
				const segment = segments[--at];
				if (segment === undefined || marklessRowFreeSymbolId(segment, segment) !== '') at = -1;
			}
		}
		if (at >= 0)
			return { moduleRootPath: segments.slice(0, at).join(''), ownerPath: segments.slice(at).join(''), chain };
	}
	// An owner no chain of its file spells was composed from another module, at that module's root.
	return { moduleRootPath: pagePath, ownerPath: '' };
}
