import type { RuntimeGraph } from '@markless/runtime';
import {
	marklessInstanceSegments,
	marklessRowFreeSymbolId,
	type MarklessScopedGraph,
} from '../fns/instance-scope.ts';

type PlacementSurface = {
	readonly rootComponentName: string | null;
	readonly components: Readonly<
		Record<
			string,
			{
				readonly edges?: ReadonlyArray<{
					readonly childComponentName: string;
					readonly symbolPrefix: string;
				}>;
			}
		>
	>;
};

export type BranchOwnerPlacement = {
	// The page path of the module root the owner was composed under.
	readonly moduleRootPath: string;
	// The owner's path from that module root, rows included.
	readonly ownerPath: string;
};

// The flip's graph stands at the owner's page path; the module's own edges say which tail of it is the module's.
export function branchOwnerPlacement(
	surface: PlacementSurface,
	ownerName: string | undefined,
	graph: RuntimeGraph,
): BranchOwnerPlacement | undefined {
	const pagePath = (graph as MarklessScopedGraph).marklessInstancePath;
	if (!ownerName || !pagePath) return undefined;
	const segments = marklessInstanceSegments(pagePath);
	const reaches = new Set<string>();
	let frontier: ReadonlyArray<readonly [string, string]> = surface.rootComponentName
		? [[surface.rootComponentName, '']]
		: [];
	for (let depth = 0; depth < segments.length && frontier.length > 0; depth++) {
		frontier = frontier.flatMap(([name, path]) =>
			(surface.components[name]?.edges ?? []).flatMap((edge) =>
				surface.components[edge.childComponentName]
					? [[edge.childComponentName, path + edge.symbolPrefix] as const]
					: [],
			),
		);
		for (const [name, path] of frontier) if (name === ownerName) reaches.add(path);
	}
	// An owner no edge of its own module reaches was composed from another module, at that module's root.
	reaches.add('');
	for (let start = 0; start <= segments.length; start++) {
		const ownerPath = segments.slice(start).join('');
		if (reaches.has(marklessRowFreeSymbolId(ownerPath, ownerPath)))
			return { moduleRootPath: segments.slice(0, start).join(''), ownerPath };
	}
	return undefined;
}
