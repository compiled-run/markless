import { MARKLESS_INTERACTION_CLOSURES } from './chunking.ts';

export const MARKLESS_INTERACTION_CLOSURES_ASSET = MARKLESS_INTERACTION_CLOSURES;

// Per route with usable demand data: the output files its landing needs before any first use.
export function plannedLandingFiles(
	bundle: Readonly<Record<string, unknown>>,
): Map<string, ReadonlySet<string>> | undefined {
	const asset = bundle[MARKLESS_INTERACTION_CLOSURES_ASSET] as
		| { readonly type?: string; readonly source?: string | Uint8Array }
		| undefined;
	if (asset?.type !== 'asset' || asset.source === undefined) return undefined;
	const parsed = JSON.parse(
		typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source),
	) as {
		readonly routes: ReadonlyArray<{
			readonly route: string;
			readonly fallback?: string;
			readonly files?: { readonly firstUse: readonly string[] };
		}>;
	};
	const planned = new Map<string, ReadonlySet<string>>();
	for (const route of parsed.routes)
		if (!route.fallback && route.files) planned.set(route.route, new Set(route.files.firstUse));
	return planned;
}
