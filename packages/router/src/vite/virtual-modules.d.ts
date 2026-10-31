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
	type AssetRoutes = import('./client-assets-manifest.ts').MarklessRouterClientAssetRoutes;

	export const routeModulePreloads: AssetRoutes['navigation'];
	export const routeSsrModulePreloads: AssetRoutes['ssr'];

	// Server lane only: the client build omits this export, and the server
	// emits `undefined` when preloads were not persisted.
	export const routeStylesheets: AssetRoutes['styles'] | undefined;
	export const documentImportMap: string;
	// Server lane only: the text of each stylesheet a page carries inline.
	export const stylesheetSources: Readonly<Record<string, string>>;
	// Server lane only.
	export const routeResumeModules: Readonly<Record<string, readonly string[]>>;

	// Appends missing `<link rel="modulepreload">` tags, returning the hrefs added.
	export function preloadRouteModule(file: string, document?: Document): string[];
	export function loadRouteStylesheets(file: string, document?: Document): Promise<unknown>;
}

declare module 'virtual:markless-router/dev-resume-modules' {
	type Loaders = Record<string, () => Promise<unknown>>;
	// undefined in a build: each page's route script names its own resume module.
	export const mdxResumeModules: Loaders | undefined;
	export const tsrxResumeModules: Loaders | undefined;
}

declare module 'virtual:markless-router/routes' {
	type RouteDiscovery = import('./runtime/create-route-discovery.ts').RouteDiscovery;

	export const pageModuleLoaders: RouteDiscovery['pageModuleLoaders'];
	export const routeFileIds: RouteDiscovery['routeFileIds'];
}

declare module 'virtual:markless-router/options' {
	export const documentNavigation: import('./document-navigation.ts').DocumentNavigation;
	export function startLinkIntentPreloading(
		root: Document | Element,
		preload: (url: URL) => void,
	): () => void;
}
declare const __MARKLESS_ROUTER_LINK_INTENT__: boolean;
