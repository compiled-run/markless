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
		{
			surface,
			hostPrefix: '',
			symbolPrefix: '',
			entry: surface.rootComponentName ?? undefined,
		},
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
			const { components, imports } = reach.surface;
			// Local components pass their placement on from the component the page reached; other exports are off that path.
			const entry = reach.entry && components[reach.entry] ? reach.entry : '';
			const queue: Array<readonly [string, string, string, ReadonlyArray<string>]> = entry
				? [[entry, '', '', [entry]]]
				: Object.keys(components).map((name) => [name, '', '', []] as const);
			for (const [name, host, symbol, above] of queue)
				for (const edge of components[name]?.edges ?? []) {
					const child = edge.childComponentName;
					if (!components[child]) {
						if (imports[child])
							next.push({
								surface: imports[child],
								hostPrefix: reach.hostPrefix + host + edge.hostPrefix,
								symbolPrefix: reach.symbolPrefix + symbol + edge.symbolPrefix,
								edge,
								edgePrefix: reach.symbolPrefix + symbol,
								entry: child,
							});
					} else if (entry && !above.includes(child))
						queue.push([
							child,
							host + edge.hostPrefix,
							symbol + edge.symbolPrefix,
							[...above, child],
						]);
				}
		}
		frontier = next;
	}
	return undefined;
}
