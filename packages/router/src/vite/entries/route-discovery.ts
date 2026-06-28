import { createRouteDiscovery } from '@arcade/router/vite/runtime/create-route-discovery';

const routeDiscovery = createRouteDiscovery(
	import.meta.glob(['/pages/**/*.tsrx', '/pages/**/*.mdx']),
);

export const pageModuleLoaders = routeDiscovery.pageModuleLoaders;
export const routeFileIds = routeDiscovery.routeFileIds;
