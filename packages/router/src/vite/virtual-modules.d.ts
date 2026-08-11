// Types for the `virtual:markless-router/*` modules the router Vite plugin
// generates at build time (see `./index.ts`: entryPathSource,
// routePreloadsSource, and the route-discovery entry file). Kept a script, not
// a module, so these stay ambient declarations rather than augmentations.
// Lives outside `entries/` because that directory ships as published source and
// is scanned for monorepo-relative imports.

declare module 'virtual:markless-router/resume-entry-path' {
	export const resumeEntryPath: string;
}

declare module 'virtual:markless-router/prerender-wake-entry-path' {
	// undefined when the prerender-wake channel is off or no entry was emitted.
	export const prerenderWakeEntryPath: string | undefined;
}

declare module 'virtual:markless-router/navigation-entry-path' {
	export const navigationEntryPath: string;
}

declare module 'virtual:markless-router/route-preloads' {
	type AssetRoutes =
		import('./client-assets-manifest.ts').MarklessRouterClientAssetRoutes;

	export const routeModulePreloads: AssetRoutes['navigation'];
	export const routeSsrModulePreloads: AssetRoutes['ssr'];

	// Server lane only: the client build omits this export, and the server
	// emits `undefined` when preloads were not persisted.
	export const routeStylesheets: AssetRoutes['styles'] | undefined;

	// Appends missing `<link rel="modulepreload">` tags, returning the hrefs added.
	export function preloadRouteModule(file: string, document?: Document): string[];
}

declare module 'virtual:markless-router/routes' {
	type RouteDiscovery = import('./runtime/create-route-discovery.ts').RouteDiscovery;

	export const pageModuleLoaders: RouteDiscovery['pageModuleLoaders'];
	export const routeFileIds: RouteDiscovery['routeFileIds'];
}
