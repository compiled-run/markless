import type { PrerenderDataSurface } from './evaluator.ts';

// Lives here, not in evaluator.ts, so a browser row mint never loads the evaluator.
export function surfaceImportKey(edge: {
	readonly childComponentName: string;
	readonly importSource?: string;
}): string {
	return edge.importSource ?? edge.childComponentName;
}

export function childEdgeSurface(
	surface: PrerenderDataSurface,
	edge: { readonly childComponentName: string; readonly importSource?: string },
): PrerenderDataSurface | undefined {
	return surface.components[edge.childComponentName]
		? surface
		: surface.imports[surfaceImportKey(edge)];
}

export type OwningSurfaceReach = {
	readonly surface: PrerenderDataSurface;
	readonly hostPrefix: string;
	readonly symbolPrefix: string;
	/** The edge that composed the owner, and the prefix its props are spelled under. */
	readonly edge?: NonNullable<PrerenderDataSurface['components'][string]['edges']>[number];
	readonly edgePrefix?: string;
};

/** The surface whose own components hold `componentName`, and the prefixes the page reaches it under. */
export function marklessOwningSurface(
	surface: PrerenderDataSurface,
	componentName: string,
	ownerHostNodeId?: string,
): OwningSurfaceReach | undefined {
	const seen = new Set<PrerenderDataSurface>();
	// Breadth-first: the shortest composition path is the one the page rendered.
	let frontier: ReadonlyArray<OwningSurfaceReach> = [
		{ surface, hostPrefix: '', symbolPrefix: '' },
	];
	while (frontier.length > 0) {
		const next: OwningSurfaceReach[] = [];
		// Two islands of one module share a surface; the owning host names which one rendered the row.
		const owners = frontier.filter((reach) => reach.surface.components[componentName]);
		if (owners.length > 0)
			return (
				owners.find((reach) => ownerHostNodeId?.startsWith(reach.hostPrefix)) ?? owners[0]
			);
		for (const reach of frontier) {
			if (seen.has(reach.surface)) continue;
			seen.add(reach.surface);
			for (const definition of Object.values(reach.surface.components))
				for (const edge of definition.edges ?? []) {
					const imported = childEdgeSurface(reach.surface, edge);
					if (imported && imported !== reach.surface)
						next.push({
							surface: imported,
							hostPrefix: reach.hostPrefix + edge.hostPrefix,
							symbolPrefix: reach.symbolPrefix + edge.symbolPrefix,
							edge,
							edgePrefix: reach.symbolPrefix,
						});
				}
		}
		frontier = next;
	}
	return undefined;
}
