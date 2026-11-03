import type { PrerenderDataSurface } from './evaluator.ts';

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
	let frontier: ReadonlyArray<OwningSurfaceReach & { readonly entry?: string }> = [
		{ surface, hostPrefix: '', symbolPrefix: '', entry: surface.rootComponentName ?? undefined },
	];
	while (frontier.length > 0) {
		const next: Array<OwningSurfaceReach & { readonly entry?: string }> = [];
		// Two islands of one module share a surface; the owning host names which one rendered the row.
		const owners = frontier.filter((reach) => reach.surface.components[componentName]);
		if (owners.length > 0)
			return (
				owners.find((reach) => ownerHostNodeId?.startsWith(reach.hostPrefix)) ?? owners[0]
			);
		for (const reach of frontier) {
			if (seen.has(reach.surface)) continue;
			seen.add(reach.surface);
			const local = localPlacements(reach.surface, reach.entry);
			const entered = !!reach.entry && !!reach.surface.components[reach.entry];
			for (const [name, definition] of Object.entries(reach.surface.components))
				for (const at of local.get(name) ?? (entered ? [] : [UNPLACED]))
					for (const edge of definition.edges ?? []) {
						const imported = reach.surface.components[edge.childComponentName]
							? undefined
							: reach.surface.imports[edge.childComponentName];
						if (imported)
							next.push({
								surface: imported,
								hostPrefix: reach.hostPrefix + at.hostPrefix + edge.hostPrefix,
								symbolPrefix: reach.symbolPrefix + at.symbolPrefix + edge.symbolPrefix,
								edge,
								edgePrefix: reach.symbolPrefix + at.symbolPrefix,
								entry: edge.childComponentName,
							});
					}
		}
		frontier = next;
	}
	return undefined;
}

type Placement = { readonly hostPrefix: string; readonly symbolPrefix: string };
const UNPLACED: Placement = { hostPrefix: '', symbolPrefix: '' };

// A component its own module renders sits under the local edges that placed it, and so does every import it composes.
// The walk starts at the component the page reached the module through: another export is not on that path.
function localPlacements(
	surface: PrerenderDataSurface,
	entry: string | undefined,
): ReadonlyMap<string, ReadonlyArray<Placement>> {
	const placed = new Map<string, Placement[]>();
	const place = (name: string, at: Placement, path: ReadonlySet<string>): void => {
		placed.set(name, [...(placed.get(name) ?? []), at]);
		for (const edge of surface.components[name]?.edges ?? [])
			if (surface.components[edge.childComponentName] && !path.has(edge.childComponentName))
				place(
					edge.childComponentName,
					{
						hostPrefix: at.hostPrefix + edge.hostPrefix,
						symbolPrefix: at.symbolPrefix + edge.symbolPrefix,
					},
					new Set(path).add(edge.childComponentName),
				);
	};
	if (entry && surface.components[entry]) {
		place(entry, UNPLACED, new Set([entry]));
		return placed;
	}
	const composed = new Set(
		Object.values(surface.components).flatMap((definition) =>
			(definition.edges ?? []).map((edge) => edge.childComponentName),
		),
	);
	for (const name of Object.keys(surface.components))
		if (!composed.has(name)) place(name, UNPLACED, new Set([name]));
	return placed;
}
