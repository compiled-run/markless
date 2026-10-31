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
			() => loader().then(withSettledPage),
		]),
	);

	return {
		pageModuleLoaders,
		routeFileIds: Object.keys(pageModuleLoaders),
	};
}

// A client page module exports its artifact as a promise.
async function withSettledPage(module: unknown): Promise<unknown> {
	const exported = (module as { default?: unknown }).default;
	const page = await exported;
	return page === exported ? module : { ...(module as object), default: page };
}
