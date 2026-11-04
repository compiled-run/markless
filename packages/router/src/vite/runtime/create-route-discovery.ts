import { normalizeRouteFileId } from '../../route-manifest.ts';

export interface RouteDiscovery {
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly routeFileIds: readonly string[];
}

export function createRouteDiscovery(
	discoveredPageModuleLoaders: Record<string, () => Promise<unknown>>,
): RouteDiscovery {
	const pageModuleLoaders = Object.fromEntries(
		Object.entries(discoveredPageModuleLoaders).map(([file, loader]) => [
			normalizeRouteFileId(file),
			// A client page module exports its artifact as a promise.
			() =>
				loader().then(async (page) => ({
					...(page as object),
					default: await (page as { default?: unknown }).default,
				})),
		]),
	);

	return {
		pageModuleLoaders,
		routeFileIds: Object.keys(pageModuleLoaders),
	};
}
