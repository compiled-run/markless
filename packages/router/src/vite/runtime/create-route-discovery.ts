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
			loader,
		]),
	);

	return {
		pageModuleLoaders,
		routeFileIds: Object.keys(pageModuleLoaders),
	};
}
