// A page's demand map is the same for each of its module requests (render data, resume, symbols), so the asset
// stores each distinct map once and names it by index per request.
export const MARKLESS_EXECUTION_DEMAND_VERSION = 2;

export function executionDemandAsset(
	entries: Iterable<readonly [string, unknown]>,
	replacer?: (key: string, value: unknown) => unknown,
): string {
	const maps: string[] = [];
	const indexOf = new Map<string, number>();
	const sources: Record<string, number> = {};
	for (const [source, map] of entries) {
		const text = JSON.stringify(map, replacer);
		let index = indexOf.get(text);
		if (index === undefined) {
			index = maps.length;
			maps.push(text);
			indexOf.set(text, index);
		}
		sources[source] = index;
	}
	return `{"version":${MARKLESS_EXECUTION_DEMAND_VERSION},"sources":${JSON.stringify(sources)},"maps":[${maps.join(',')}]}`;
}

/** Each module request's demand map, keyed by its root-relative request. */
export function readExecutionDemandAsset<Map = unknown>(source: string): Record<string, Map> {
	const parsed = JSON.parse(source) as {
		readonly sources: Readonly<Record<string, number>>;
		readonly maps: readonly Map[];
	};
	return Object.fromEntries(
		Object.entries(parsed.sources).map(([request, index]) => [request, parsed.maps[index]!]),
	);
}
