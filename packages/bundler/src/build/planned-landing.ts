import { MARKLESS_INTERACTION_CLOSURES } from './chunking.ts';

export const MARKLESS_INTERACTION_CLOSURES_ASSET = MARKLESS_INTERACTION_CLOSURES;

type PlannedAsset = {
	readonly routes: ReadonlyArray<{
		readonly route: string;
		readonly fallback?: string;
		readonly files?: { readonly firstUse: readonly string[] };
	}>;
	readonly stylesheetRoutes?: Readonly<Record<string, readonly string[]>>;
};

function plannedAsset(bundle: Readonly<Record<string, unknown>>): PlannedAsset | undefined {
	const asset = bundle[MARKLESS_INTERACTION_CLOSURES_ASSET] as
		| { readonly type?: string; readonly source?: string | Uint8Array }
		| undefined;
	if (asset?.type !== 'asset' || asset.source === undefined) return undefined;
	return JSON.parse(
		typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source),
	) as PlannedAsset;
}

// Per route with usable demand data: the output files its landing needs before any first use.
export function plannedLandingFiles(
	bundle: Readonly<Record<string, unknown>>,
): Map<string, ReadonlySet<string>> | undefined {
	const parsed = plannedAsset(bundle);
	if (!parsed) return undefined;
	const planned = new Map<string, ReadonlySet<string>>();
	for (const route of parsed.routes)
		if (!route.fallback && route.files) planned.set(route.route, new Set(route.files.firstUse));
	return planned;
}

// Per emitted stylesheet the planner could attribute: the routes that render one of its style modules.
// A stylesheet missing here has unknown readers, so every route that reaches it keeps it.
export function plannedStylesheetRoutes(
	bundle: Readonly<Record<string, unknown>>,
): Map<string, ReadonlySet<string>> {
	return new Map(
		Object.entries(plannedAsset(bundle)?.stylesheetRoutes ?? {}).map(([file, routes]) => [
			file,
			new Set(routes),
		]),
	);
}
